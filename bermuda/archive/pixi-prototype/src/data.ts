export interface Poi {
  id: string; name: string; fa: string; type: string; danger: number;
  region: string; x: number; y: number; tile: [number, number]
}

export interface Camp {
  id: string; name: string; x: number; y: number; tile: [number, number];
  garrison: Record<string, number>; tower: boolean; radius: number
}

export interface Building {
  x: number; y: number; type: string; style: string; rot: number; w: number; h: number
}

export interface WorldJson {
  meta: { tile: number; grid: [number, number]; world_px: [number, number] }
  spawn: Poi
  regions: { id: string; name: string; name_fa: string; cx: number; cy: number }[]
  pois: Poi[]
  alien_zones: { id: string; name: string; name_fa: string; x: number; y: number; r: number; spawns: Record<string, number> }[]
  bestiary: { id: string; name: string; fa: string; tier: number; role: string }[]
  camps: Camp[]
  prop_types: string[]
  grid: [number, number]
  tile: number
  world_px: number
}

export interface Prop { x: number; y: number; t: number; rot: number; scale: number }

export interface WorldData {
  json: WorldJson
  tiles: Uint8Array
  collision: Uint8Array
  height: Uint8Array
  props: Prop[]
  buildings: Building[]
  n: number
  tile: number
  worldPx: number
}

const BASE = (import.meta as any).env?.BASE_URL ?? './'
const url = (p: string) => BASE + p

async function bin(path: string): Promise<Uint8Array> {
  const res = await fetch(url(path))
  if (!res.ok) throw new Error('missing ' + path)
  return new Uint8Array(await res.arrayBuffer())
}

export async function loadWorld(onProgress?: (p: number) => void): Promise<WorldData> {
  onProgress?.(0.05)
  const json: WorldJson = await (await fetch(url('world/world.json'))).json()
  onProgress?.(0.25)
  const [tiles, collision, height, propsRaw, buildings] = await Promise.all([
    bin('world/tiles.bin'),
    bin('world/collision.bin'),
    bin('world/height.bin'),
    bin('world/props.bin'),
    fetch(url('world/buildings.json')).then(r => r.json())
  ])
  onProgress?.(0.75)

  const props: Prop[] = []
  const dv = new DataView(propsRaw.buffer, propsRaw.byteOffset, propsRaw.byteLength)
  for (let o = 0; o + 7 <= propsRaw.byteLength; o += 7) {
    props.push({
      x: dv.getUint16(o, true),
      y: dv.getUint16(o + 2, true),
      t: dv.getUint8(o + 4),
      rot: dv.getUint8(o + 5) * 360 / 255,
      scale: dv.getUint8(o + 6)
    })
  }
  onProgress?.(0.9)

  return {
    json, tiles, collision, height, props, buildings,
    n: json.grid[0], tile: json.tile, worldPx: json.world_px
  }
}
