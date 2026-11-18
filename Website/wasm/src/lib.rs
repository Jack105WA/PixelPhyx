mod chemistry;
mod engine;
mod grid;
mod render;
mod ropes;
mod rigid_bodies;

use wasm_bindgen::prelude::*;
pub use engine::World;

#[wasm_bindgen]
pub fn prepare_velocity(cells: &[u8], velocity_x: &mut [f32], velocity_y: &mut [f32], gravity: f32) {
    grid::prepare_velocity(cells, velocity_x, velocity_y, gravity);
}

#[wasm_bindgen]
pub fn render_cells(cells: &[u8], wetness: &[f32], heat: &[f32], colors: &[u8], width: u32, height: u32) -> Vec<u8> {
    render::render_cells(cells, wetness, heat, colors, width as usize, height as usize)
}

#[wasm_bindgen]
pub fn count_particles(cells: &[u8]) -> u32 {
    cells.iter().filter(|&&material| material != 0).count() as u32
}

/// Executes all material chemistry and thermal kernels in one WASM boundary crossing.
#[wasm_bindgen]
pub fn step_chemistry(
    cells: &mut [u8], wetness: &mut [f32], heat: &mut [f32], heat_inputs: &mut [f32],
    air: &mut [f32], next_air: &mut [f32], fuel: &mut [f32],
    burn: &mut [f32], age: &mut [u16], corrosion: &mut [f32],
    ambient: f32, width: u32, height: u32,
) -> u32 {
    let w = width as usize;
    let h = height as usize;
    chemistry::step_material_thermal(cells, wetness, heat, air, next_air, fuel, burn, age, corrosion, ambient, w, h);
    let input_len = cells.len().min(heat.len()).min(heat_inputs.len());
    for i in 0..input_len {
        if heat_inputs[i] > 0.0 {
            heat[i] = (heat[i] + heat_inputs[i]).min(1600.0);
            heat_inputs[i] = 0.0;
        }
    }
    chemistry::step_acid(cells, corrosion, burn, heat, wetness, fuel, age, w, h);
    let detonations = chemistry::step_combustion(cells, heat, wetness, fuel, burn, age, ambient, w, h);
    chemistry::step_phase_changes(cells, age, ambient, w, h);
    detonations
}

#[wasm_bindgen]
pub fn step_particles(
    cells:&mut [u8], updated:&mut [u8], vx:&mut [f32], vy:&mut [f32],
    wet:&mut [f32], heat:&mut [f32], heat_inputs:&mut [f32],
    fuel:&mut [f32], burn:&mut [f32], age:&mut [u16], corrosion:&mut [f32],
    width:u32,height:u32,gravity:f32,seed:u32,
)->Vec<u32>{
    grid::step_particles(cells,updated,vx,vy,wet,heat,heat_inputs,fuel,burn,age,corrosion,width as usize,height as usize,gravity,seed)
}

#[wasm_bindgen]
pub fn step_ropes(x:&mut[f32],y:&mut[f32],px:&mut[f32],py:&mut[f32],ox:&mut[f32],oy:&mut[f32],anchors:&[u8],drag:&[u8],offsets:&[u32],lengths:&[f32],cells:&[u8],width:u32,height:u32,gravity:f32){ropes::step_ropes(x,y,px,py,ox,oy,anchors,drag,offsets,lengths,cells,width as usize,height as usize,gravity);}

/// Integrates rigid bodies and resolves body-to-body oriented-box collisions.
#[wasm_bindgen]
pub fn step_rigid_bodies(state: &mut [f32], gravity: f32, dt: f32) {
    rigid_bodies::step_rigid_bodies(state, gravity, dt);
}

/// Renders the pixel layer and glow mask in one WASM call.
#[wasm_bindgen]
pub fn render_frame(cells:&[u8],wetness:&[f32],heat:&[f32],colors:&[u8],moving:&[u8],width:u32,height:u32)->Vec<u8>{
 render::render_frame(cells,wetness,heat,colors,moving,width as usize,height as usize)
}

/// Returns the final pixel frame with its glow layer composited in Rust.
#[wasm_bindgen]
pub fn render_composited_frame(cells:&[u8],wetness:&[f32],heat:&[f32],colors:&[u8],moving:&[u8],width:u32,height:u32)->Vec<u8>{
 render::render_composited_frame(cells,wetness,heat,colors,moving,width as usize,height as usize)
}
