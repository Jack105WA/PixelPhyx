mod grid;
mod render;

use wasm_bindgen::prelude::*;

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
