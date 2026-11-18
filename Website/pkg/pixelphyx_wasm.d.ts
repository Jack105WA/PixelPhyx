/* tslint:disable */
/* eslint-disable */

export class World {
    free(): void;
    [Symbol.dispose](): void;
    add_body(x: number, y: number, half_w: number, half_h: number, mass: number): number;
    add_rope(ax: number, ay: number, bx: number, by: number, length: number, stiffness: number): number;
    body_count(): number;
    clear(): void;
    configure_material(id: number, density: number, gravity: number, liquid: boolean, gas: boolean, rgba: Uint8Array | number[]): void;
    dimensions(): Uint32Array;
    get_cells(): Uint8Array;
    constructor(width: number, height: number);
    particle_count(): number;
    pointer_button(down: boolean): void;
    pointer_move(x: number, y: number): void;
    pointer_paint(): void;
    render_rgba(): Uint8Array;
    rope_count(): number;
    set_brush(material: number, radius: number): void;
    set_cell(x: number, y: number, material: number): void;
    set_gravity(value: number): void;
    set_paused(value: boolean): void;
    set_reaction(a: number, b: number, result: number): void;
    step(iterations: number): void;
}

export function count_particles(cells: Uint8Array | number[]): number;

/**
 * Converts a browser pointer position into world-grid coordinates.
 */
export function map_pointer(client_x: number, client_y: number, left: number, top: number, css_width: number, css_height: number, width: number, height: number): Int32Array;

/**
 * Rasterizes a circular brush or line segment directly into the material grid.
 */
export function paint_segment(cells: Uint8Array, x0: number, y0: number, x1: number, y1: number, radius: number, material: number, width: number, height: number): void;

export function prepare_velocity(cells: Uint8Array | number[], velocity_x: Float32Array, velocity_y: Float32Array, gravity: number): void;

export function render_cells(cells: Uint8Array | number[], wetness: Float32Array | number[], heat: Float32Array | number[], colors: Uint8Array | number[], width: number, height: number): Uint8Array;

/**
 * Returns the final pixel frame with its glow layer composited in Rust.
 */
export function render_composited_frame(cells: Uint8Array | number[], wetness: Float32Array | number[], heat: Float32Array | number[], colors: Uint8Array | number[], moving: Uint8Array | number[], width: number, height: number): Uint8Array;

/**
 * Renders the pixel layer and glow mask in one WASM call.
 */
export function render_frame(cells: Uint8Array | number[], wetness: Float32Array | number[], heat: Float32Array | number[], colors: Uint8Array | number[], moving: Uint8Array | number[], width: number, height: number): Uint8Array;

/**
 * Executes all material chemistry and thermal kernels in one WASM boundary crossing.
 */
export function step_chemistry(cells: Uint8Array, wetness: Float32Array, heat: Float32Array, heat_inputs: Float32Array, air: Float32Array, next_air: Float32Array, fuel: Float32Array, burn: Float32Array, age: Uint16Array, corrosion: Float32Array, ambient: number, width: number, height: number): number;

export function step_particles(cells: Uint8Array, updated: Uint8Array, vx: Float32Array, vy: Float32Array, wet: Float32Array, heat: Float32Array, heat_inputs: Float32Array, fuel: Float32Array, burn: Float32Array, age: Uint16Array, corrosion: Float32Array, blocked: Uint8Array | number[], width: number, height: number, gravity: number, seed: number): Uint32Array;

/**
 * Integrates rigid bodies and resolves body-to-body oriented-box collisions.
 */
export function step_rigid_bodies(state: Float32Array, gravity: number, dt: number): void;

export function step_ropes(x: Float32Array, y: Float32Array, px: Float32Array, py: Float32Array, ox: Float32Array, oy: Float32Array, anchors: Uint8Array | number[], drag: Uint8Array | number[], offsets: Uint32Array | number[], lengths: Float32Array | number[], cells: Uint8Array | number[], width: number, height: number, gravity: number): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_world_free: (a: number, b: number) => void;
    readonly count_particles: (a: number, b: number) => number;
    readonly map_pointer: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly paint_segment: (a: number, b: number, c: any, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
    readonly prepare_velocity: (a: number, b: number, c: number, d: number, e: any, f: number, g: number, h: any, i: number) => void;
    readonly render_cells: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly render_composited_frame: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number];
    readonly render_frame: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number];
    readonly step_chemistry: (a: number, b: number, c: any, d: number, e: number, f: any, g: number, h: number, i: any, j: number, k: number, l: any, m: number, n: number, o: any, p: number, q: number, r: any, s: number, t: number, u: any, v: number, w: number, x: any, y: number, z: number, a1: any, b1: number, c1: number, d1: any, e1: number, f1: number, g1: number) => number;
    readonly step_particles: (a: number, b: number, c: any, d: number, e: number, f: any, g: number, h: number, i: any, j: number, k: number, l: any, m: number, n: number, o: any, p: number, q: number, r: any, s: number, t: number, u: any, v: number, w: number, x: any, y: number, z: number, a1: any, b1: number, c1: number, d1: any, e1: number, f1: number, g1: any, h1: number, i1: number, j1: number, k1: number, l1: number, m1: number) => [number, number];
    readonly step_rigid_bodies: (a: number, b: number, c: any, d: number, e: number) => void;
    readonly step_ropes: (a: number, b: number, c: any, d: number, e: number, f: any, g: number, h: number, i: any, j: number, k: number, l: any, m: number, n: number, o: any, p: number, q: number, r: any, s: number, t: number, u: number, v: number, w: number, x: number, y: number, z: number, a1: number, b1: number, c1: number, d1: number, e1: number) => void;
    readonly world_add_body: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly world_add_rope: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly world_body_count: (a: number) => number;
    readonly world_clear: (a: number) => void;
    readonly world_configure_material: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly world_dimensions: (a: number) => [number, number];
    readonly world_get_cells: (a: number) => [number, number];
    readonly world_new: (a: number, b: number) => number;
    readonly world_particle_count: (a: number) => number;
    readonly world_pointer_button: (a: number, b: number) => void;
    readonly world_pointer_move: (a: number, b: number, c: number) => void;
    readonly world_pointer_paint: (a: number) => void;
    readonly world_render_rgba: (a: number) => [number, number];
    readonly world_rope_count: (a: number) => number;
    readonly world_set_brush: (a: number, b: number, c: number) => void;
    readonly world_set_cell: (a: number, b: number, c: number, d: number) => void;
    readonly world_set_gravity: (a: number, b: number) => void;
    readonly world_set_paused: (a: number, b: number) => void;
    readonly world_set_reaction: (a: number, b: number, c: number, d: number) => void;
    readonly world_step: (a: number, b: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
