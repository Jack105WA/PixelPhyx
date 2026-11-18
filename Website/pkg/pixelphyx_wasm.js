/* @ts-self-types="./pixelphyx_wasm.d.ts" */

export class World {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WorldFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_world_free(ptr, 0);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} half_w
     * @param {number} half_h
     * @param {number} mass
     * @returns {number}
     */
    add_body(x, y, half_w, half_h, mass) {
        const ret = wasm.world_add_body(this.__wbg_ptr, x, y, half_w, half_h, mass);
        return ret >>> 0;
    }
    /**
     * @param {number} ax
     * @param {number} ay
     * @param {number} bx
     * @param {number} by
     * @param {number} length
     * @param {number} stiffness
     * @returns {number}
     */
    add_rope(ax, ay, bx, by, length, stiffness) {
        const ret = wasm.world_add_rope(this.__wbg_ptr, ax, ay, bx, by, length, stiffness);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    body_count() {
        const ret = wasm.world_body_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    clear() {
        wasm.world_clear(this.__wbg_ptr);
    }
    /**
     * @param {number} id
     * @param {number} density
     * @param {number} gravity
     * @param {boolean} liquid
     * @param {boolean} gas
     * @param {Uint8Array | number[]} rgba
     */
    configure_material(id, density, gravity, liquid, gas, rgba) {
        const val2 = +id;
        const val3 = +density;
        const val4 = +gravity;
        const val5 = +liquid;
        const val6 = +gas;
        const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.world_configure_material(this.__wbg_ptr, val2, val3, val4, val5, val6, ptr0, len0);
    }
    /**
     * @returns {Uint32Array}
     */
    dimensions() {
        const ret = wasm.world_dimensions(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get_cells() {
        const ret = wasm.world_get_cells(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {number} width
     * @param {number} height
     */
    constructor(width, height) {
        const ret = wasm.world_new(width, height);
        this.__wbg_ptr = ret;
        WorldFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    particle_count() {
        const ret = wasm.world_particle_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {boolean} down
     */
    pointer_button(down) {
        wasm.world_pointer_button(this.__wbg_ptr, down);
    }
    /**
     * @param {number} x
     * @param {number} y
     */
    pointer_move(x, y) {
        wasm.world_pointer_move(this.__wbg_ptr, x, y);
    }
    pointer_paint() {
        wasm.world_pointer_paint(this.__wbg_ptr);
    }
    /**
     * @returns {Uint8Array}
     */
    render_rgba() {
        const ret = wasm.world_render_rgba(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number}
     */
    rope_count() {
        const ret = wasm.world_rope_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} material
     * @param {number} radius
     */
    set_brush(material, radius) {
        wasm.world_set_brush(this.__wbg_ptr, material, radius);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} material
     */
    set_cell(x, y, material) {
        wasm.world_set_cell(this.__wbg_ptr, x, y, material);
    }
    /**
     * @param {number} value
     */
    set_gravity(value) {
        wasm.world_set_gravity(this.__wbg_ptr, value);
    }
    /**
     * @param {boolean} value
     */
    set_paused(value) {
        wasm.world_set_paused(this.__wbg_ptr, value);
    }
    /**
     * @param {number} a
     * @param {number} b
     * @param {number} result
     */
    set_reaction(a, b, result) {
        wasm.world_set_reaction(this.__wbg_ptr, a, b, result);
    }
    /**
     * @param {number} iterations
     */
    step(iterations) {
        wasm.world_step(this.__wbg_ptr, iterations);
    }
}
if (Symbol.dispose) World.prototype[Symbol.dispose] = World.prototype.free;

/**
 * @param {Uint8Array | number[]} cells
 * @returns {number}
 */
export function count_particles(cells) {
    const ptr0 = passArray8ToWasm0(cells, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.count_particles(ptr0, len0);
    return ret >>> 0;
}

/**
 * Converts a browser pointer position into world-grid coordinates.
 * @param {number} client_x
 * @param {number} client_y
 * @param {number} left
 * @param {number} top
 * @param {number} css_width
 * @param {number} css_height
 * @param {number} width
 * @param {number} height
 * @returns {Int32Array}
 */
export function map_pointer(client_x, client_y, left, top, css_width, css_height, width, height) {
    const ret = wasm.map_pointer(client_x, client_y, left, top, css_width, css_height, width, height);
    var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
}

/**
 * Rasterizes a circular brush or line segment directly into the material grid.
 * @param {Uint8Array} cells
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} radius
 * @param {number} material
 * @param {number} width
 * @param {number} height
 */
export function paint_segment(cells, x0, y0, x1, y1, radius, material, width, height) {
    const val2 = +x0;
    const val3 = +y0;
    const val4 = +x1;
    const val5 = +y1;
    const val6 = +radius;
    const val7 = +material;
    const val8 = +width;
    const val9 = +height;
    var ptr0 = passArray8ToWasm0(cells, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.paint_segment(ptr0, len0, cells, val2, val3, val4, val5, val6, val7, val8, val9);
}

/**
 * @param {Uint8Array | number[]} cells
 * @param {Float32Array} velocity_x
 * @param {Float32Array} velocity_y
 * @param {number} gravity
 */
export function prepare_velocity(cells, velocity_x, velocity_y, gravity) {
    const val4 = +gravity;
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passArray8ToWasm0(cells, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF32ToWasm0(velocity_x, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArrayF32ToWasm0(velocity_y, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    wasm.prepare_velocity(ptr0, len0, ptr1, len1, velocity_x, ptr2, len2, velocity_y, val4);
}

/**
 * @param {Uint8Array | number[]} cells
 * @param {Float32Array | number[]} wetness
 * @param {Float32Array | number[]} heat
 * @param {Uint8Array | number[]} colors
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function render_cells(cells, wetness, heat, colors, width, height) {
    const val5 = +width;
    const val6 = +height;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3;
    try {
        ptr0 = passArray8ToWasm0(cells, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF32ToWasm0(wetness, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArrayF32ToWasm0(heat, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArray8ToWasm0(colors, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.render_cells(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, val5, val6);
    var v7 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v7;
}

/**
 * Returns the final pixel frame with its glow layer composited in Rust.
 * @param {Uint8Array | number[]} cells
 * @param {Float32Array | number[]} wetness
 * @param {Float32Array | number[]} heat
 * @param {Uint8Array | number[]} colors
 * @param {Uint8Array | number[]} moving
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function render_composited_frame(cells, wetness, heat, colors, moving, width, height) {
    const val6 = +width;
    const val7 = +height;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4;
    try {
        ptr0 = passArray8ToWasm0(cells, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF32ToWasm0(wetness, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArrayF32ToWasm0(heat, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArray8ToWasm0(colors, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passArray8ToWasm0(moving, wasm.__wbindgen_malloc);
        len4 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 1, 1); }
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.render_composited_frame(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, val6, val7);
    var v8 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v8;
}

/**
 * Renders the pixel layer and glow mask in one WASM call.
 * @param {Uint8Array | number[]} cells
 * @param {Float32Array | number[]} wetness
 * @param {Float32Array | number[]} heat
 * @param {Uint8Array | number[]} colors
 * @param {Uint8Array | number[]} moving
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function render_frame(cells, wetness, heat, colors, moving, width, height) {
    const val6 = +width;
    const val7 = +height;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4;
    try {
        ptr0 = passArray8ToWasm0(cells, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF32ToWasm0(wetness, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArrayF32ToWasm0(heat, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArray8ToWasm0(colors, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passArray8ToWasm0(moving, wasm.__wbindgen_malloc);
        len4 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 1, 1); }
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.render_frame(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, val6, val7);
    var v8 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v8;
}

/**
 * Executes all material chemistry and thermal kernels in one WASM boundary crossing.
 * @param {Uint8Array} cells
 * @param {Float32Array} wetness
 * @param {Float32Array} heat
 * @param {Float32Array} heat_inputs
 * @param {Float32Array} air
 * @param {Float32Array} next_air
 * @param {Float32Array} fuel
 * @param {Float32Array} burn
 * @param {Uint16Array} age
 * @param {Float32Array} corrosion
 * @param {number} ambient
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function step_chemistry(cells, wetness, heat, heat_inputs, air, next_air, fuel, burn, age, corrosion, ambient, width, height) {
    const val11 = +ambient;
    const val12 = +width;
    const val13 = +height;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, ptr8, len8, ptr9, len9;
    try {
        ptr0 = passArray8ToWasm0(cells, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF32ToWasm0(wetness, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArrayF32ToWasm0(heat, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArrayF32ToWasm0(heat_inputs, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passArrayF32ToWasm0(air, wasm.__wbindgen_malloc);
        len4 = WASM_VECTOR_LEN;
        ptr5 = passArrayF32ToWasm0(next_air, wasm.__wbindgen_malloc);
        len5 = WASM_VECTOR_LEN;
        ptr6 = passArrayF32ToWasm0(fuel, wasm.__wbindgen_malloc);
        len6 = WASM_VECTOR_LEN;
        ptr7 = passArrayF32ToWasm0(burn, wasm.__wbindgen_malloc);
        len7 = WASM_VECTOR_LEN;
        ptr8 = passArray16ToWasm0(age, wasm.__wbindgen_malloc);
        len8 = WASM_VECTOR_LEN;
        ptr9 = passArrayF32ToWasm0(corrosion, wasm.__wbindgen_malloc);
        len9 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr9) { wasm.__wbindgen_free(ptr9, len9 * 4, 4); }
        if (ptr8) { wasm.__wbindgen_free(ptr8, len8 * 2, 2); }
        if (ptr7) { wasm.__wbindgen_free(ptr7, len7 * 4, 4); }
        if (ptr6) { wasm.__wbindgen_free(ptr6, len6 * 4, 4); }
        if (ptr5) { wasm.__wbindgen_free(ptr5, len5 * 4, 4); }
        if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 4, 4); }
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 4, 4); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.step_chemistry(ptr0, len0, cells, ptr1, len1, wetness, ptr2, len2, heat, ptr3, len3, heat_inputs, ptr4, len4, air, ptr5, len5, next_air, ptr6, len6, fuel, ptr7, len7, burn, ptr8, len8, age, ptr9, len9, corrosion, val11, val12, val13);
    return ret >>> 0;
}

/**
 * @param {Uint8Array} cells
 * @param {Uint8Array} updated
 * @param {Float32Array} vx
 * @param {Float32Array} vy
 * @param {Float32Array} wet
 * @param {Float32Array} heat
 * @param {Float32Array} heat_inputs
 * @param {Float32Array} fuel
 * @param {Float32Array} burn
 * @param {Uint16Array} age
 * @param {Float32Array} corrosion
 * @param {Uint8Array | number[]} blocked
 * @param {number} width
 * @param {number} height
 * @param {number} gravity
 * @param {number} seed
 * @returns {Uint32Array}
 */
export function step_particles(cells, updated, vx, vy, wet, heat, heat_inputs, fuel, burn, age, corrosion, blocked, width, height, gravity, seed) {
    const val13 = +width;
    const val14 = +height;
    const val15 = +gravity;
    const val16 = +seed;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, ptr8, len8, ptr9, len9, ptr10, len10, ptr11, len11;
    try {
        ptr0 = passArray8ToWasm0(cells, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(updated, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArrayF32ToWasm0(vx, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArrayF32ToWasm0(vy, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passArrayF32ToWasm0(wet, wasm.__wbindgen_malloc);
        len4 = WASM_VECTOR_LEN;
        ptr5 = passArrayF32ToWasm0(heat, wasm.__wbindgen_malloc);
        len5 = WASM_VECTOR_LEN;
        ptr6 = passArrayF32ToWasm0(heat_inputs, wasm.__wbindgen_malloc);
        len6 = WASM_VECTOR_LEN;
        ptr7 = passArrayF32ToWasm0(fuel, wasm.__wbindgen_malloc);
        len7 = WASM_VECTOR_LEN;
        ptr8 = passArrayF32ToWasm0(burn, wasm.__wbindgen_malloc);
        len8 = WASM_VECTOR_LEN;
        ptr9 = passArray16ToWasm0(age, wasm.__wbindgen_malloc);
        len9 = WASM_VECTOR_LEN;
        ptr10 = passArrayF32ToWasm0(corrosion, wasm.__wbindgen_malloc);
        len10 = WASM_VECTOR_LEN;
        ptr11 = passArray8ToWasm0(blocked, wasm.__wbindgen_malloc);
        len11 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr11) { wasm.__wbindgen_free(ptr11, len11 * 1, 1); }
        if (ptr10) { wasm.__wbindgen_free(ptr10, len10 * 4, 4); }
        if (ptr9) { wasm.__wbindgen_free(ptr9, len9 * 2, 2); }
        if (ptr8) { wasm.__wbindgen_free(ptr8, len8 * 4, 4); }
        if (ptr7) { wasm.__wbindgen_free(ptr7, len7 * 4, 4); }
        if (ptr6) { wasm.__wbindgen_free(ptr6, len6 * 4, 4); }
        if (ptr5) { wasm.__wbindgen_free(ptr5, len5 * 4, 4); }
        if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 4, 4); }
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 4, 4); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.step_particles(ptr0, len0, cells, ptr1, len1, updated, ptr2, len2, vx, ptr3, len3, vy, ptr4, len4, wet, ptr5, len5, heat, ptr6, len6, heat_inputs, ptr7, len7, fuel, ptr8, len8, burn, ptr9, len9, age, ptr10, len10, corrosion, ptr11, len11, val13, val14, val15, val16);
    var v17 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v17;
}

/**
 * Integrates rigid bodies and resolves body-to-body oriented-box collisions.
 * @param {Float32Array} state
 * @param {number} gravity
 * @param {number} dt
 */
export function step_rigid_bodies(state, gravity, dt) {
    const val2 = +gravity;
    const val3 = +dt;
    var ptr0 = passArrayF32ToWasm0(state, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.step_rigid_bodies(ptr0, len0, state, val2, val3);
}

/**
 * @param {Float32Array} x
 * @param {Float32Array} y
 * @param {Float32Array} px
 * @param {Float32Array} py
 * @param {Float32Array} ox
 * @param {Float32Array} oy
 * @param {Uint8Array | number[]} anchors
 * @param {Uint8Array | number[]} drag
 * @param {Uint32Array | number[]} offsets
 * @param {Float32Array | number[]} lengths
 * @param {Uint8Array | number[]} cells
 * @param {number} width
 * @param {number} height
 * @param {number} gravity
 */
export function step_ropes(x, y, px, py, ox, oy, anchors, drag, offsets, lengths, cells, width, height, gravity) {
    const val12 = +width;
    const val13 = +height;
    const val14 = +gravity;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, ptr8, len8, ptr9, len9, ptr10, len10;
    try {
        ptr0 = passArrayF32ToWasm0(x, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF32ToWasm0(y, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArrayF32ToWasm0(px, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArrayF32ToWasm0(py, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passArrayF32ToWasm0(ox, wasm.__wbindgen_malloc);
        len4 = WASM_VECTOR_LEN;
        ptr5 = passArrayF32ToWasm0(oy, wasm.__wbindgen_malloc);
        len5 = WASM_VECTOR_LEN;
        ptr6 = passArray8ToWasm0(anchors, wasm.__wbindgen_malloc);
        len6 = WASM_VECTOR_LEN;
        ptr7 = passArray8ToWasm0(drag, wasm.__wbindgen_malloc);
        len7 = WASM_VECTOR_LEN;
        ptr8 = passArray32ToWasm0(offsets, wasm.__wbindgen_malloc);
        len8 = WASM_VECTOR_LEN;
        ptr9 = passArrayF32ToWasm0(lengths, wasm.__wbindgen_malloc);
        len9 = WASM_VECTOR_LEN;
        ptr10 = passArray8ToWasm0(cells, wasm.__wbindgen_malloc);
        len10 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr10) { wasm.__wbindgen_free(ptr10, len10 * 1, 1); }
        if (ptr9) { wasm.__wbindgen_free(ptr9, len9 * 4, 4); }
        if (ptr8) { wasm.__wbindgen_free(ptr8, len8 * 4, 4); }
        if (ptr7) { wasm.__wbindgen_free(ptr7, len7 * 1, 1); }
        if (ptr6) { wasm.__wbindgen_free(ptr6, len6 * 1, 1); }
        if (ptr5) { wasm.__wbindgen_free(ptr5, len5 * 4, 4); }
        if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 4, 4); }
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 4, 4); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 4, 4); }
        throw e;
    }
    wasm.step_ropes(ptr0, len0, x, ptr1, len1, y, ptr2, len2, px, ptr3, len3, py, ptr4, len4, ox, ptr5, len5, oy, ptr6, len6, ptr7, len7, ptr8, len8, ptr9, len9, ptr10, len10, val12, val13, val14);
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_copy_to_typed_array_680b191e71920dc1: function(arg0, arg1, arg2) {
            new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
        },
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
        },
    };
    return {
        __proto__: null,
        "./pixelphyx_wasm_bg.js": import0,
    };
}

const WorldFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_world_free(ptr, 1));

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray16ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 2, 2) >>> 0;
    getUint16ArrayMemory0().set(arg, ptr / 2);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes);
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedInt32ArrayMemory0 = null;
    cachedUint16ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

let __wbg_init_promise;
async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path) {

    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('pixelphyx_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
