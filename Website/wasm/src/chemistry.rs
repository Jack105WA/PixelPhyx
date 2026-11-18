// Material chemistry kernels. This module owns reaction state mutation for WASM.
pub fn step_acid(
    cells: &mut [u8],
    corrosion: &mut [f32],
    burn: &mut [f32],
    heat: &mut [f32],
    wetness: &mut [f32],
    fuel: &mut [f32],
    age: &mut [u16],
    width: usize,
    height: usize,
) {
    let len = width.saturating_mul(height)
        .min(cells.len()).min(corrosion.len()).min(burn.len())
        .min(heat.len()).min(wetness.len()).min(fuel.len()).min(age.len());
    if width == 0 || height == 0 { return; }

    for i in 0..len {
        if cells[i] != 7 { continue; } // Acid
        let x = i % width;
        let y = i / width;
        if age[i] > 1800 {
            cells[i] = 0;
            continue;
        }

        let neighbors = [
            if y > 0 { Some(i - width) } else { None },
            if x > 0 { Some(i - 1) } else { None },
            if x + 1 < width { Some(i + 1) } else { None },
            if y + 1 < height { Some(i + width) } else { None },
        ];

        for ni in neighbors.into_iter().flatten() {
            let resistance = match cells[ni] {
                1 => 18.0,  // Sand
                13 => 24.0, // Plant
                4 => 42.0,  // Wood
                3 => 95.0,  // Stone
                15 => 125.0,// Glass
                10 => 10.0, // Ice
                14 => 8.0,  // Salt
                _ => continue,
            };
            corrosion[ni] += if cells[ni] == 1 || cells[ni] == 14 { 1.2 } else { 0.65 };
            if corrosion[ni] >= resistance {
                cells[ni] = 0;
                corrosion[ni] = 0.0;
                burn[ni] = 0.0;
                heat[ni] = 0.0;
                wetness[ni] = 0.0;
                fuel[ni] = 0.0;
                age[ni] = 0;
            }
        }
    }

    // State arrays belonging to erased cells must not retain stale chemistry.
    for i in 0..len {
        if cells[i] == 0 {
            corrosion[i] = 0.0;
            burn[i] = 0.0;
            heat[i] = 0.0;
            wetness[i] = 0.0;
            fuel[i] = 0.0;
            age[i] = 0;
        }
    }
}

fn random01(index: usize, age: u16, salt: u32) -> f32 {
    let mut x = (index as u32).wrapping_mul(0x9E37_79B9)
        ^ (age as u32).wrapping_mul(0x85EB_CA6B) ^ salt;
    x ^= x >> 16;
    x = x.wrapping_mul(0x7FEB_352D);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846C_A68B);
    x ^= x >> 16;
    (x as f64 / u32::MAX as f64) as f32
}

pub fn step_phase_changes(cells: &mut [u8], age: &[u16], ambient: f32, width: usize, height: usize) {
    let len = width.saturating_mul(height).min(cells.len()).min(age.len());
    if width == 0 || height == 0 { return; }
    let freeze = (-ambient / 9000.0).clamp(0.0, 0.12);
    let melt = (ambient / 14000.0).clamp(0.0, 0.10);
    let evaporation = ((ambient - 100.0) / 18000.0).clamp(0.0, 0.05);
    for i in 0..len {
        match cells[i] {
            2 if random01(i, age[i], 0xA341_316C) < freeze => cells[i] = 10,
            10 if random01(i, age[i], 0xC801_3EA4) < melt => cells[i] = 2,
            2 if random01(i, age[i], 0xAD90_777D) < evaporation => cells[i] = 8,
            _ => {}
        }
    }
}

fn material_ignition(material: u8) -> f32 {
    match material { 4 => 270.0, 6 | 12 => 180.0, 13 => 90.0, 16 => 520.0, _ => 0.0 }
}
fn material_fuel(material: u8) -> f32 {
    match material { 4 | 6 | 12 => 1.0, 13 => 0.65, 16 => 0.12, _ => 0.0 }
}
fn flammable(material: u8) -> bool { material_fuel(material) > 0.0 }
fn ignite(cells: &[u8], heat: &mut [f32], fuel: &mut [f32], burn: &mut [f32], i: usize, material: u8) {
    if !flammable(material) { return; }
    if fuel[i] <= 0.0 { fuel[i] = material_fuel(material).max(1.0); }
    burn[i] = burn[i].max(1.0);
    heat[i] = heat[i].max(material_ignition(material).max(100.0));
    let _ = cells;
}

pub fn step_combustion(
    cells: &mut [u8], heat: &mut [f32], wetness: &[f32],
    fuel: &mut [f32], burn: &mut [f32], age: &[u16],
    ambient: f32, width: usize, height: usize,
) {
    let len = width.saturating_mul(height).min(cells.len()).min(heat.len())
        .min(wetness.len()).min(fuel.len()).min(burn.len()).min(age.len());
    if width == 0 || height == 0 { return; }

    for i in 0..len {
        let material = cells[i];
        if material == 0 { continue; }
        let x = i % width;
        let y = i / width;
        if material == 5 { // Fire
            heat[i] = heat[i].max(700.0 + random01(i, age[i], 0xF1AE_0001) * 250.0);
            burn[i] += 1.0;
            let lifetime = 100.0 + random01(i, age[i], 0xF1AE_0002) * 100.0;
            if burn[i] > lifetime {
                cells[i] = 9; heat[i] = 120.0; burn[i] = 0.0; continue;
            }
            let neighbors = [
                if y > 0 { Some(i-width) } else { None },
                if x > 0 { Some(i-1) } else { None },
                if x+1 < width { Some(i+1) } else { None },
                if y+1 < height { Some(i+width) } else { None },
                if y > 0 && x > 0 { Some(i-width-1) } else { None },
                if y > 0 && x+1 < width { Some(i-width+1) } else { None },
            ];
            for (slot, neighbor) in neighbors.into_iter().enumerate() {
                let Some(ni) = neighbor else { continue; };
                let target = cells[ni];
                if target == 2 || target == 10 {
                    if random01(i, age[i], 0xF1AE_1000 + slot as u32) < 0.22 {
                        cells[i] = 8; heat[i] = 0.0; burn[i] = 0.0; break;
                    }
                    continue;
                }
                if flammable(target) {
                    let moisture = wetness[ni].clamp(0.0, 1.0);
                    let chance = (match target { 6=>0.62,13=>0.38,4=>0.28,_=>0.12 }) * (1.0-moisture*0.94);
                    let added = match target { 6=>85.0,4=>55.0,13=>45.0,_=>28.0 };
                    heat[ni] = (heat[ni]+added).min(1600.0);
                    if heat[ni] > material_ignition(target).max(200.0)
                        && random01(ni, age[ni], 0xF1AE_2000 + slot as u32) < chance {
                        ignite(cells, heat, fuel, burn, ni, target);
                    }
                }
            }
            if random01(i, age[i], 0xF1AE_3000) < 0.006 {
                cells[i] = 9; heat[i] = 0.0; burn[i] = 0.0;
            }
            continue;
        }

        if material == 11 { // Lava
            heat[i] = heat[i].max(850.0);
            let neighbors = [
                if y > 0 { Some(i-width) } else { None },
                if x > 0 { Some(i-1) } else { None },
                if x+1 < width { Some(i+1) } else { None },
                if y+1 < height { Some(i+width) } else { None },
            ];
            for (slot, neighbor) in neighbors.into_iter().enumerate() {
                let Some(ni) = neighbor else { continue; };
                let target = cells[ni];
                if target == 2 || target == 10 {
                    cells[i] = 3; cells[ni] = 8; heat[ni] = 180.0; break;
                }
                if flammable(target) {
                    let added = match target { 6=>100.0,4=>70.0,_=>55.0 };
                    heat[ni] = (heat[ni]+added).min(1600.0);
                    let chance = match target { 6=>0.58,13=>0.35,_=>0.24 };
                    if heat[ni] > material_ignition(target).max(200.0)
                        && random01(ni, age[ni], 0x1A7A_0000 + slot as u32) < chance {
                        ignite(cells, heat, fuel, burn, ni, target);
                    }
                }
            }
            continue;
        }

        if material == 4 || material == 13 || material == 6 || material == 12 {
            if heat[i] > 0.0 {
                let cooling = (match material { 4=>1.2,13=>2.4,_=>0.7 }) + wetness[i]*8.0;
                heat[i] = (heat[i]-cooling).max(ambient);
            }
            let ignition_chance = match material { 12=>0.22,6=>0.16,13=>0.12,_=>0.075 }
                * (1.0-wetness[i].clamp(0.0,1.0)*0.94);
            if heat[i] > material_ignition(material).max(220.0)
                && random01(i, age[i], 0x1A17_1000) < ignition_chance {
                ignite(cells, heat, fuel, burn, i, material);
            }
            if burn[i] > 0.0 {
                burn[i] += 1.0;
                let consumption = match material { 4=>0.003,13=>0.012,6=>0.025,_=>0.018 }
                    * (1.0-wetness[i].clamp(0.0,1.0)*0.8);
                let starting_fuel = if fuel[i] > 0.0 { fuel[i] } else { material_fuel(material).max(1.0) };
                fuel[i] = (starting_fuel-consumption).max(0.0);
                if fuel[i] <= 0.0 {
                    match material {
                        4 => { cells[i]=16; heat[i]=0.0; burn[i]=0.0; fuel[i]=0.0; }
                        13 => { cells[i]=if random01(i,age[i],0xB1A_0001)<0.55 {0} else {9}; heat[i]=0.0; burn[i]=0.0; }
                        _ => { cells[i]=5; heat[i]=650.0; burn[i]=0.0; }
                    }
                }
            }
        }
    }
}
