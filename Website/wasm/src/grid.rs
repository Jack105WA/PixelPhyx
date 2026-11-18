// Core particle force integration. Kept in WASM so the simulation tick has one
// authoritative implementation for gravity, drag, velocity limits, and sleeping.
pub fn prepare_velocity(cells: &[u8], velocity_x: &mut [f32], velocity_y: &mut [f32], gravity: f32) {
    let len = cells.len().min(velocity_x.len()).min(velocity_y.len());
    let acceleration = 0.055 * gravity.clamp(0.0, 3.0);

    for index in 0..len {
        if cells[index] == 0 {
            velocity_x[index] = 0.0;
            velocity_y[index] = 0.0;
            continue;
        }

        let vx = velocity_x[index];
        let vy = velocity_y[index];
        if vx.abs() + vy.abs() < 0.12 {
            velocity_x[index] = 0.0;
            velocity_y[index] = 0.0;
            continue;
        }

        velocity_y[index] = ((vy + acceleration) * 0.965).clamp(-16.0, 16.0);
        velocity_x[index] = (vx * 0.965).clamp(-16.0, 16.0);
    }

    velocity_x[len..].fill(0.0);
    velocity_y[len..].fill(0.0);
}
