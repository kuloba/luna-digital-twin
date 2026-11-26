import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { type BufferGeometry, type Group, LineSegments, type Material, Matrix4, Mesh, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Draw-call batching for scenery. Children render as authored; once mounted,
 * every opaque mesh and edge line that shares a material is merged into one
 * object and the originals are hidden (they stay in the tree, so picking and
 * React updates keep working). A once-a-second check watches the originals:
 * if one moves, changes colour, is shown or unmounts, its bucket is rebuilt
 * without it, so animated or state-driven parts can never freeze.
 *
 * Mark a subtree `userData={{ dynamic: true }}` to keep it out up front.
 */

type Drawable = Mesh | LineSegments;

interface Entry {
  obj: Drawable;
  snap: string;
}

interface Bucket {
  entries: Entry[];
  material: Material;
  line: boolean;
  cast: boolean;
  receive: boolean;
  order: number;
  merged?: Drawable;
}

const noRaycast = () => {};

function matKey(m: Material & Record<string, unknown>) {
  const hex = (c: unknown) => (c && typeof c === "object" && "getHexString" in c ? (c as { getHexString(): string }).getHexString() : "");
  return [m.type, hex(m.color), hex(m.emissive), m.emissiveIntensity, m.roughness, m.metalness, m.flatShading, m.toneMapped, m.side, m.depthWrite, m.depthTest, m.opacity].join("|");
}

function snapshot(o: Drawable) {
  const m = o.material as Material & Record<string, unknown>;
  const e = o.matrixWorld.elements;
  let s = "";
  for (let i = 0; i < 16; i++) s += e[i].toFixed(3) + ",";
  return s + matKey(m) + (m.transparent ? "t" : "") + (o.parent ? "p" : "");
}

function mergeable(o: Object3D): o is Drawable {
  const d = o as Drawable & { isInstancedMesh?: boolean; isLineSegments2?: boolean };
  if (!(d instanceof Mesh || d instanceof LineSegments)) return false;
  if (d.isInstancedMesh || d.isLineSegments2) return false;
  const m = d.material as Material & { map?: unknown; isMeshStandardMaterial?: boolean; isMeshBasicMaterial?: boolean; isLineBasicMaterial?: boolean };
  if (Array.isArray(m) || m.transparent || m.map) return false;
  if (d instanceof LineSegments ? !m.isLineBasicMaterial : !(m.isMeshStandardMaterial || m.isMeshBasicMaterial)) return false;
  const g = d.geometry as BufferGeometry;
  if (!g.attributes.position || g.morphAttributes.position) return false;
  if (!(d instanceof LineSegments) && !g.attributes.normal) return false;
  return true;
}

export function Static({ children }: { children: ReactNode }) {
  const root = useRef<Group>(null);
  const buckets = useRef(new Map<string, Bucket>());
  const nextCheck = useRef(0);
  const scans = useRef(0);
  const tracked = useRef(new WeakSet<Object3D>());

  const build = (b: Bucket, inv: Matrix4) => {
    const parent = root.current;
    if (!parent) return;
    if (b.merged) {
      parent.remove(b.merged);
      b.merged.geometry.dispose();
      b.merged = undefined;
    }
    if (b.entries.length < 2) {
      // A lone mesh draws itself; it joins a batch if a twin mounts later.
      for (const e of b.entries) e.obj.visible = true;
      return;
    }
    const m = new Matrix4();
    const geos = b.entries.map(({ obj }) => {
      obj.updateWorldMatrix(true, false);
      let g = (obj.geometry as BufferGeometry).clone();
      g.clearGroups();
      if (g.index) {
        const ni = g.toNonIndexed();
        g.dispose();
        g = ni;
      }
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
      if (b.line) g.deleteAttribute("normal");
      g.applyMatrix4(m.multiplyMatrices(inv, obj.matrixWorld));
      return g;
    });
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!geo) {
      for (const e of b.entries) e.obj.visible = true;
      b.entries = [];
      return;
    }
    const out: Drawable = b.line ? new LineSegments(geo, b.material) : new Mesh(geo, b.material);
    out.castShadow = b.cast;
    out.receiveShadow = b.receive;
    out.renderOrder = b.order;
    out.raycast = noRaycast;
    out.matrixAutoUpdate = false;
    out.userData.dynamic = true;
    parent.add(out);
    b.merged = out;
    for (const e of b.entries) {
      e.obj.visible = false;
      e.snap = snapshot(e.obj);
    }
  };

  // Collect anything mergeable that is not tracked yet. Runs on mount and
  // again for a few seconds, because suspended children attach later.
  const scan = () => {
    const g = root.current;
    if (!g) return;
    g.updateWorldMatrix(true, true);
    const map = buckets.current;
    const dirty = new Set<Bucket>();
    const visit = (o: Object3D) => {
      if (o.userData.dynamic || !o.visible) return;
      if (o !== g && !tracked.current.has(o) && mergeable(o)) {
        tracked.current.add(o);
        const mat = o.material as Material & Record<string, unknown>;
        const line = o instanceof LineSegments;
        const key = `${line ? "L" : "M"}|${matKey(mat)}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
        let b = map.get(key);
        if (!b) {
          b = { entries: [], material: mat.clone(), line, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder };
          map.set(key, b);
        }
        b.entries.push({ obj: o, snap: "" });
        dirty.add(b);
      }
      for (const c of o.children) visit(c);
    };
    visit(g);
    if (!dirty.size) return;
    const inv = g.matrixWorld.clone().invert();
    for (const b of dirty) build(b, inv);
  };

  useLayoutEffect(() => {
    const g = root.current;
    const map = buckets.current;
    scan();
    return () => {
      for (const b of map.values()) {
        if (b.merged) {
          g?.remove(b.merged);
          b.merged.geometry.dispose();
        }
        b.material.dispose();
        for (const e of b.entries) if (e.obj.parent) e.obj.visible = true;
      }
      map.clear();
      tracked.current = new WeakSet();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once a second: anything that moved, recoloured, reappeared or unmounted
  // leaves its bucket and renders on its own from then on. For the first
  // ten seconds, also pick up children that mounted late.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (t < nextCheck.current || !root.current) return;
    nextCheck.current = t + 1;
    if (scans.current < 10) {
      scans.current++;
      scan();
    }
    let inv: Matrix4 | undefined;
    for (const b of buckets.current.values()) {
      if (!b.merged) continue;
      const keep: Entry[] = [];
      let dirty = false;
      for (const e of b.entries) {
        const o = e.obj;
        if (o.visible || !o.parent || snapshot(o) !== e.snap) {
          dirty = true;
          if (o.parent) {
            o.visible = true;
            o.userData.dynamic = true;
          }
        } else keep.push(e);
      }
      if (!dirty) continue;
      b.entries = keep;
      inv ??= root.current.matrixWorld.clone().invert();
      build(b, inv);
    }
  });

  return <group ref={root}>{children}</group>;
}
