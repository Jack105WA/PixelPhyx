pub fn prepare_velocity(cells: &[u8], velocity_x: &mut [f32], velocity_y: &mut [f32], gravity: f32) {
    let len = cells.len().min(velocity_x.len()).min(velocity_y.len());
    let acceleration = 0.055 * gravity.clamp(0.0, 3.0);
    for index in 0..len {
        if cells[index] == 0 || velocity_x[index].abs() + velocity_y[index].abs() < 0.12 {
            velocity_x[index] = 0.0;
            velocity_y[index] = 0.0;
        } else {
            velocity_y[index] += acceleration;
        }
    }
    velocity_x[len..].fill(0.0);
    velocity_y[len..].fill(0.0);
}
