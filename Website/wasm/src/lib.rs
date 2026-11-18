mod chemistry;
mod engine;
mod grid;
mod render;

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
pub fn count_particles(cells: &[u8]) -> u32 { cells.iter().filter(|&&m| m != 0).count() as u32 }

#[wasm_bindgen]
pub fn step_acid_chemistry(cells: &mut [u8], corrosion: &mut [f32], burn: &mut [f32], heat: &mut [f32], wetness: &mut [f32], fuel: &mut [f32], age: &mut [u16], width: u32, height: u32) {
    chemistry::step_acid(cells, corrosion, burn, heat, wetness, fuel, age, width as usize, height as usize);
}

#[wasm_bindgen]
pub fn step_phase_changes(cells: &mut [u8], age: &[u16], ambient: f32, width: u32, height: u32) {
    chemistry::step_phase_changes(cells, age, ambient, width as usize, height as usize);
}
