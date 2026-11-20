mod chemistry;
mod engine;
mod grid;
mod input;
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
    blocked:&[u8], width:u32,height:u32,gravity:f32,seed:u32,
)->Vec<u32>{
    // Ignite fuse while the flame is still in its pre-movement position.
    chemistry::prime_fuse_ignition(cells,heat,fuel,burn,width as usize,height as usize);
    grid::step_particles(cells,updated,vx,vy,wet,heat,heat_inputs,fuel,burn,age,corrosion,blocked,width as usize,height as usize,gravity,seed)
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

/// Converts a browser pointer position into world-grid coordinates.
#[wasm_bindgen]
pub fn map_pointer(client_x:f64,client_y:f64,left:f64,top:f64,css_width:f64,css_height:f64,width:u32,height:u32)->Vec<i32>{
 input::map_pointer(client_x,client_y,left,top,css_width,css_height,width,height)
}
/// Rasterizes a circular brush or line segment directly into the material grid.
#[wasm_bindgen]
pub fn paint_segment(cells:&mut[u8],x0:i32,y0:i32,x1:i32,y1:i32,radius:i32,material:u8,width:u32,height:u32){
 input::paint_segment(cells,x0,y0,x1,y1,radius,material,width,height)
}

#[cfg(test)]
mod exported_api_tests {
    use super::{count_particles, prepare_velocity, step_chemistry};

    #[test]
    fn particle_count_matches_non_empty_material_cells() {
        assert_eq!(count_particles(&[]), 0);
        assert_eq!(count_particles(&[0, 1, 0, 2, 255, 0]), 3);
    }

    #[test]
    fn velocity_wrapper_applies_gravity_and_clears_unmatched_tail() {
        let cells = [1u8, 0, 1];
        let mut velocity_x = [1.0f32, 8.0, 9.0];
        let mut velocity_y = [1.0f32];

        prepare_velocity(&cells, &mut velocity_x, &mut velocity_y, 1.0);

        assert!((velocity_x[0] - 0.965).abs() < 0.0001);
        assert!((velocity_y[0] - 1.018075).abs() < 0.0001);
        assert_eq!(velocity_x[1], 0.0);
        assert_eq!(velocity_x[2], 0.0);
    }

    #[test]
    fn chemistry_wrapper_consumes_heat_inputs() {
        let mut cells = vec![0u8; 9];
        cells[4] = 5; // Fire.
        let mut wetness = vec![0.0f32; 9];
        let mut heat = vec![0.0f32; 9];
        let mut heat_inputs = vec![0.0f32; 9];
        let mut air = vec![20.0f32; 9];
        let mut next_air = vec![20.0f32; 9];
        let mut fuel = vec![0.0f32; 9];
        let mut burn = vec![0.0f32; 9];
        let mut age = vec![0u16; 9];
        let mut corrosion = vec![0.0f32; 9];
        heat_inputs[4] = 125.0;

        step_chemistry(
            &mut cells, &mut wetness, &mut heat, &mut heat_inputs,
            &mut air, &mut next_air, &mut fuel, &mut burn, &mut age,
            &mut corrosion, 20.0, 3, 3,
        );

        assert_eq!(heat_inputs[4], 0.0);
        assert!(heat[4] >= 125.0);
        assert!(heat.iter().all(|value| value.is_finite()));
        assert!(air.iter().all(|value| value.is_finite()));
    }

    fn run_deterministic_world() -> (Vec<u8>, Vec<f32>, Vec<f32>, Vec<f32>, Vec<f32>, Vec<f32>, Vec<f32>, Vec<u16>, Vec<f32>, Vec<f32>, Vec<f32>) {
        const WIDTH: u32 = 8;
        const HEIGHT: u32 = 8;
        let len = (WIDTH * HEIGHT) as usize;
        let mut cells = vec![0u8; len];
        cells[9] = 1;  // Sand.
        cells[10] = 2; // Water.
        cells[27] = 5; // Fire.
        cells[28] = 17; // Fuse.
        cells[36] = 7; // Acid.
        cells[37] = 1; // Sand exposed to acid.
        let mut updated = vec![0u8; len];
        let mut vx = vec![0.0f32; len];
        let mut vy = vec![0.0f32; len];
        let mut wetness = vec![0.0f32; len];
        let mut heat = vec![0.0f32; len];
        let mut heat_inputs = vec![0.0f32; len];
        let mut air = vec![20.0f32; len];
        let mut next_air = vec![20.0f32; len];
        let mut fuel = vec![0.0f32; len];
        let mut burn = vec![0.0f32; len];
        let mut age = vec![0u16; len];
        let mut corrosion = vec![0.0f32; len];
        let blocked = vec![0u8; len];
        wetness[9] = 0.3;
        heat[27] = 850.0;
        heat_inputs[27] = 25.0;

        for tick in 0..120u32 {
            updated.fill(0);
            step_particles(
                &mut cells, &mut updated, &mut vx, &mut vy,
                &mut wetness, &mut heat, &mut heat_inputs, &mut fuel,
                &mut burn, &mut age, &mut corrosion, &blocked,
                WIDTH, HEIGHT, 1.0, 0xA5A5_1234 ^ tick,
            );
            step_chemistry(
                &mut cells, &mut wetness, &mut heat, &mut heat_inputs,
                &mut air, &mut next_air, &mut fuel, &mut burn,
                &mut age, &mut corrosion, 20.0, WIDTH, HEIGHT,
            );
        }

        (cells, vx, vy, wetness, heat, heat_inputs, air, age, fuel, burn, corrosion)
    }

    #[test]
    fn complete_particle_and_chemistry_ticks_are_deterministic() {
        let first = run_deterministic_world();
        let second = run_deterministic_world();
        assert_eq!(first, second);
    }

    #[test]
    fn complete_tick_sequence_keeps_all_state_finite_and_sized() {
        let (cells, vx, vy, wetness, heat, heat_inputs, air, age, fuel, burn, corrosion) =
            run_deterministic_world();
        let len = 8 * 8;
        assert_eq!(cells.len(), len);
        assert_eq!(age.len(), len);
        for values in [&vx, &vy, &wetness, &heat, &heat_inputs, &air, &fuel, &burn, &corrosion] {
            assert_eq!(values.len(), len);
            assert!(values.iter().all(|value| value.is_finite()));
        }
    }

}
