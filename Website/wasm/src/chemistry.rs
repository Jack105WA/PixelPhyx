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
                28 => 18.0, // Soil
                13 | 18..=22 => 24.0, // Plant life
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

// Deterministic, non-cryptographic simulation noise; the stream tag separates effects.
fn random01(index: usize, age: u16, stream_tag: u32) -> f32 {
    let mut x = (index as u32).wrapping_mul(0x9E37_79B9)
        ^ (age as u32).wrapping_mul(0x85EB_CA6B) ^ stream_tag;
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
        let y = i / width;
        match cells[i] {
            2 if random01(i, age[i], 0xA341_316C) < freeze => cells[i] = 10,
            10 if random01(i, age[i], 0xC801_3EA4) < melt => cells[i] = 2,
            2 if random01(i, age[i], 0xAD90_777D) < evaporation
                || (ambient > 180.0 && random01(i, age[i], 0xAD90_777E) < 0.012) => cells[i] = 8,
            14 if y + 1 < height && cells[i + width] == 2
                && random01(i, age[i], 0x5A17_0001) < 0.04 => cells[i] = 0,
            8 if random01(i, age[i], 0x57EA_0001) < 0.004994 => cells[i] = 2,
            9 if random01(i, age[i], 0x5A0C_0001) < 0.004994 => cells[i] = 0,
            _ => {}
        }
    }
}

fn material_ignition(material: u8) -> f32 {
    match material { 4 => 270.0, 6 | 12 => 180.0, 13 | 18..=22 => 90.0, 16 => 520.0, 17 => 85.0, _ => 0.0 }
}
fn material_fuel(material: u8) -> f32 {
    match material { 4 | 6 | 12 => 1.0, 13 | 18..=22 => 0.65, 16 => 0.12, 17 => 0.34, _ => 0.0 }
}
fn flammable(material: u8) -> bool { material_fuel(material) > 0.0 }
fn ignite(heat: &mut [f32], fuel: &mut [f32], burn: &mut [f32], i: usize, material: u8) {
    if !flammable(material) { return; }
    if fuel[i] <= 0.0 { fuel[i] = material_fuel(material).max(0.001); }
    burn[i] = burn[i].max(1.0);
    heat[i] = heat[i].max(material_ignition(material).max(100.0));
}

// Capture fuse ignition before the particle movement pass can move a flame away.
pub fn prime_fuse_ignition(
    cells: &[u8], heat: &mut [f32], fuel: &mut [f32], burn: &mut [f32],
    width: usize, height: usize,
) {
    let len = width.saturating_mul(height).min(cells.len())
        .min(heat.len()).min(fuel.len()).min(burn.len());
    if width == 0 || height == 0 { return; }

    for i in 0..len {
        if cells[i] != 17 || burn[i] > 0.0 { continue; }
        let x = i % width;
        let y = i / width;
        let mut touching_fire = false;
        for dy in -1isize..=1 {
            for dx in -1isize..=1 {
                if dx == 0 && dy == 0 { continue; }
                let nx = x as isize + dx;
                let ny = y as isize + dy;
                if nx < 0 || ny < 0 || nx >= width as isize || ny >= height as isize { continue; }
                if cells[ny as usize * width + nx as usize] == 5 {
                    touching_fire = true;
                    break;
                }
            }
            if touching_fire { break; }
        }
        if touching_fire {
            fuel[i] = material_fuel(17);
            burn[i] = 1.0;
            heat[i] = heat[i].max(900.0);
        }
    }
}

pub fn step_combustion(
    cells: &mut [u8], heat: &mut [f32], wetness: &[f32],
    fuel: &mut [f32], burn: &mut [f32], age: &[u16],
    ambient: f32, width: usize, height: usize,
) -> u32 {
    let len = width.saturating_mul(height).min(cells.len()).min(heat.len())
        .min(wetness.len()).min(fuel.len()).min(burn.len()).min(age.len());
    let mut detonations = 0u32;
    if width == 0 || height == 0 { return 0; }

    // Pre-pass makes ignition independent of whether fire is left or right
    // of the fuse in the row-major simulation scan.
    for i in 0..len {
        if cells[i] != 17 || burn[i] > 0.0 { continue; }
        let x = i % width;
        let y = i / width;
        let mut touching_fire = false;
        for dy in -1isize..=1 {
            for dx in -1isize..=1 {
                if dx == 0 && dy == 0 { continue; }
                let nx = x as isize + dx;
                let ny = y as isize + dy;
                if nx < 0 || ny < 0 || nx >= width as isize || ny >= height as isize { continue; }
                if cells[ny as usize * width + nx as usize] == 5 {
                    touching_fire = true;
                    break;
                }
            }
            if touching_fire { break; }
        }
        if touching_fire {
            fuel[i] = material_fuel(17);
            burn[i] = 1.0;
            heat[i] = 900.0;
        }
    }

    for i in 0..len {
        if cells[i] == 12 {
            let x=i%width; let y=i/width;
            let triggered=(y+1<height && cells[i+width]==5)
                || (x+1<width && cells[i+1]==5)
                || (x>0 && cells[i-1]==5);
            if triggered {
                detonations=detonations.saturating_add(1);
                for dy in -17isize..=17 {
                    for dx in -17isize..=17 {
                        let distance=((dx*dx+dy*dy) as f32).sqrt();
                        if distance>=17.0 {continue;}
                        let px=x as isize+dx; let py=y as isize+dy;
                        if px<0||py<0||px>=width as isize||py>=height as isize {continue;}
                        let ni=py as usize*width+px as usize;
                        let seed=0x7A7A_0000u32.wrapping_add((dx+17) as u32*37).wrapping_add((dy+17) as u32*131);
                        let inner=distance<17.0*(0.4+random01(ni,age[i],seed)*0.35);
                        if inner {
                            cells[ni]=if random01(ni,age[i],seed^0x55AA)<0.35 {5} else {0};
                        } else if cells[ni]!=3 {
                            cells[ni]=if random01(ni,age[i],seed^0xAA55)<0.4 {5} else {9};
                        }
                    }
                }
                continue;
            }
        }
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
                if target == 17 {
                    // A flame directly touching fuse cord lights that segment reliably.
                    ignite(heat, fuel, burn, ni, target);
                    continue;
                }
                if flammable(target) {
                    let moisture = wetness[ni].clamp(0.0, 1.0);
                    let chance = (match target { 6=>0.62,13=>0.38,4=>0.28,_=>0.12 }) * (1.0-moisture*0.94);
                    let added = match target { 6=>85.0,4=>55.0,13=>45.0,_=>28.0 };
                    heat[ni] = (heat[ni]+added).min(1600.0);
                    if heat[ni] > material_ignition(target).max(200.0)
                        && random01(ni, age[ni], 0xF1AE_2000 + slot as u32) < chance {
                        ignite(heat, fuel, burn, ni, target);
                    }
                }
            }
            if random01(i, age[i], 0xF1AE_3000) < 0.006 {
                cells[i] = 9; heat[i] = 0.0; burn[i] = 0.0;
            }
            continue;
        }

        if material == 17 { // Fuse cord burns progressively along connected segments.
            if heat[i] > material_ignition(material) || burn[i] > 0.0 {
                if burn[i] <= 0.0 { ignite(heat, fuel, burn, i, material); }
                burn[i] += 1.0;
                heat[i] = heat[i].max(520.0);
                // Follow one continuous path instead of igniting every
                // touching segment. fuel stores the direction this segment was
                // entered from: 1=right, 2=up, 3=down, 4=left.
                if burn[i] >= 8.0 {
                    let incoming = if fuel[i] >= 10.0 {
                        (fuel[i] as u8).saturating_sub(10)
                    } else { 0 };
                    let candidates: [Option<(usize, u8)>; 4] = match incoming {
                        1 => [
                            if x + 1 < width { Some((i + 1, 1)) } else { None },
                            if y > 0 { Some((i - width, 2)) } else { None },
                            if y + 1 < height { Some((i + width, 3)) } else { None },
                            if x > 0 { Some((i - 1, 4)) } else { None },
                        ],
                        2 => [
                            if y > 0 { Some((i - width, 2)) } else { None },
                            if x + 1 < width { Some((i + 1, 1)) } else { None },
                            if x > 0 { Some((i - 1, 4)) } else { None },
                            if y + 1 < height { Some((i + width, 3)) } else { None },
                        ],
                        3 => [
                            if y + 1 < height { Some((i + width, 3)) } else { None },
                            if x + 1 < width { Some((i + 1, 1)) } else { None },
                            if x > 0 { Some((i - 1, 4)) } else { None },
                            if y > 0 { Some((i - width, 2)) } else { None },
                        ],
                        4 => [
                            if x > 0 { Some((i - 1, 4)) } else { None },
                            if y > 0 { Some((i - width, 2)) } else { None },
                            if y + 1 < height { Some((i + width, 3)) } else { None },
                            if x + 1 < width { Some((i + 1, 1)) } else { None },
                        ],
                        _ => [
                            if x + 1 < width { Some((i + 1, 1)) } else { None },
                            if y > 0 { Some((i - width, 2)) } else { None },
                            if y + 1 < height { Some((i + width, 3)) } else { None },
                            if x > 0 { Some((i - 1, 4)) } else { None },
                        ],
                    };
                    for candidate in candidates.into_iter().flatten() {
                        let (next, direction) = candidate;
                        if cells[next] == 17 && burn[next] <= 0.0 {
                            fuel[next] = 10.0 + direction as f32;
                            burn[next] = 1.0;
                            heat[next] = 900.0;
                            break;
                        }
                    }
                    cells[i] = 9;
                    heat[i] = 180.0;
                    burn[i] = 0.0;
                    fuel[i] = 0.0;
                    continue;
                }
                fuel[i] = (material_fuel(17) * (1.0 - burn[i] / 8.0)).max(0.0);
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
                        ignite(heat, fuel, burn, ni, target);
                    }
                }
            }
            continue;
        }

        if material == 4 || material == 13 || material == 6 || material == 12 {
            if heat[i] > 0.0 {
                let cooling = (match material { 4=>1.2,13|18..=22=>2.4,_=>0.7 }) + wetness[i]*8.0;
                heat[i] = (heat[i]-cooling).max(ambient);
            }
            let ignition_chance = match material { 12=>0.22,6=>0.16,13|18..=22=>0.12,_=>0.075 }
                * (1.0-wetness[i].clamp(0.0,1.0)*0.94);
            if heat[i] > material_ignition(material).max(220.0)
                && random01(i, age[i], 0x1A17_1000) < ignition_chance {
                ignite(heat, fuel, burn, i, material);
            }
            if burn[i] > 0.0 {
                burn[i] += 1.0;
                let consumption = match material { 4=>0.003,13|18..=22=>0.012,6=>0.025,_=>0.018 }
                    * (1.0-wetness[i].clamp(0.0,1.0)*0.8);
                let starting_fuel = if fuel[i] > 0.0 { fuel[i] } else { material_fuel(material).max(0.001) };
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
    detonations

}

fn conductivity(material: u8) -> f32 {
    match material {
        1=>0.08,28=>0.10,2=>0.58,3=>0.18,4=>0.12,5=>0.02,6=>0.09,7=>0.3,
        8=>0.04,9=>0.015,10=>0.22,11=>0.8,12=>0.1,13=>0.12,
        14=>0.12,15=>0.9,16=>0.12,_=>0.05
    }
}

pub fn step_material_thermal(
    cells: &[u8], wetness: &mut [f32], heat: &mut [f32],
    air: &mut [f32], next_air: &mut [f32], fuel: &mut [f32],
    burn: &mut [f32], age: &mut [u16], corrosion: &mut [f32],
    ambient: f32, width: usize, height: usize,
) {
    let len = width.saturating_mul(height).min(cells.len()).min(wetness.len())
        .min(heat.len()).min(air.len()).min(next_air.len()).min(fuel.len())
        .min(burn.len()).min(age.len()).min(corrosion.len());
    if width == 0 || height == 0 { return; }

    // Water saturates porous sand and plant matter without consuming the water cell.
    for i in 0..len {
        if cells[i] != 2 { continue; }
        let x=i%width; let y=i/width;
        let neighbors=[
            if y>0 {Some(i-width)} else {None},
            if x>0 {Some(i-1)} else {None},
            if x+1<width {Some(i+1)} else {None},
            if y+1<height {Some(i+width)} else {None},
        ];
        for (slot, neighbor) in neighbors.into_iter().enumerate() {
            let Some(ni)=neighbor else {continue;};
            if (cells[ni]==1 || cells[ni]==28) && wetness[ni]<1.0
                && random01(ni,age[ni],0xAE75_0000+slot as u32)<0.12 {
                wetness[ni]+=(0.025_f32).min(1.0-wetness[ni]);
            }
            if (cells[ni]==13 || (18..=22).contains(&cells[ni])) && random01(ni,age[ni],0xA17A_0000+slot as u32)<0.08 {
                wetness[ni]=(wetness[ni]+0.15).min(1.0);
            }
        }
    }

    // Heat exchange with the air volume and upward convection.
    for i in 0..len {
        let material=cells[i];
        let source=material==5||material==11;
        let target=if source { heat[i].max(if material==11 {900.0}else{780.0}) } else {ambient};
        air[i]+=(target-air[i])*(if source {0.16}else{0.0015});
    }
    for y in 0..height {
        for x in 0..width {
            let i=y*width+x;
            if i>=len {continue;}
            let here=air[i];
            let up=if y>0 {air[i-width]} else {ambient};
            let left=if x>0 {air[i-1]} else {ambient};
            let right=if x+1<width {air[i+1]} else {ambient};
            let down=if y+1<height&&i+width<len {air[i+width]} else {ambient};
            next_air[i]=(here+(down-here)*0.105+(left+right-2.0*here)*0.018+(up-here)*0.006).max(ambient);
        }
    }
    air[..len].copy_from_slice(&next_air[..len]);

    // Matter-to-matter conduction and ambient cooling.
    for i in 0..len {
        let material=cells[i];
        if material==0 { continue; }
        age[i]=age[i].saturating_add(1);
        if (material==1 || material==28) && wetness[i]>0.0 { wetness[i]=(wetness[i]-0.0008).max(0.0); }
        let x=i%width; let y=i/width;
        if heat[i]>ambient {
            let neighbors=[
                if x+1<width {Some(i+1)} else {None},
                if y+1<height&&i+width<len {Some(i+width)} else {None},
                if x>0 {Some(i-1)} else {None},
                if y>0 {Some(i-width)} else {None},
            ];
            for neighbor in neighbors.into_iter().flatten() {
                let other=cells[neighbor];
                if other==0 {continue;}
                let transfer=(heat[i]-heat[neighbor])*(conductivity(material)*conductivity(other)*1.5).min(0.08);
                if transfer.abs()>0.05 {heat[i]-=transfer;heat[neighbor]+=transfer;}
            }
        }
        if heat[i]>ambient {
            heat[i]=(heat[i]-conductivity(material)*0.015).max(ambient);
        } else if heat[i]<ambient {heat[i]=ambient;}
    }

    // Convected air heats exposed matter and can ignite flammable materials.
    for i in 0..len {
        let material=cells[i];
        if material==0 {continue;}
        let air_temperature=air[i];
        if air_temperature>heat[i] {
            heat[i]+=(air_temperature-heat[i])*(if material==4 {0.055}else{0.035});
        }
        let ignition=material_ignition(material);
        if flammable(material) && heat[i] > (if ignition > 0.0 { ignition } else { 220.0 }) {
            let chance=(match material {4=>0.018,13=>0.025,6=>0.04,12=>0.025,17=>0.12,_=>0.008})
                *(1.0-wetness[i].clamp(0.0,1.0)*0.94);
            if random01(i,age[i],0xA17E_1000)<chance {
                ignite(heat,fuel,burn,i,material);
            }
        }
    }

    // Clear all per-cell chemistry when the corresponding particle no longer exists.
    for i in 0..len {
        if cells[i]==0 {
            wetness[i]=0.0;heat[i]=0.0;fuel[i]=0.0;burn[i]=0.0;age[i]=0;corrosion[i]=0.0;
        }
    }
}


#[cfg(test)]
mod tests {
    use super::{step_acid, step_material_thermal, step_phase_changes};

    #[test]
    fn acid_corrosion_removes_sand_and_clears_its_state() {
        let mut cells = vec![0u8; 9];
        cells[4] = 7; // Acid
        cells[5] = 1; // Sand
        let mut corrosion = vec![0.0f32; 9];
        let mut burn = vec![0.0f32; 9];
        let mut heat = vec![0.0f32; 9];
        let mut wetness = vec![0.0f32; 9];
        let mut fuel = vec![0.0f32; 9];
        let mut age = vec![0u16; 9];
        burn[5] = 0.5;
        heat[5] = 100.0;
        wetness[5] = 0.75;
        fuel[5] = 0.8;
        age[5] = 12;

        for _ in 0..15 {
            step_acid(&mut cells, &mut corrosion, &mut burn, &mut heat,
                &mut wetness, &mut fuel, &mut age, 3, 3);
        }

        assert_eq!(cells[5], 0);
        assert_eq!(corrosion[5], 0.0);
        assert_eq!(burn[5], 0.0);
        assert_eq!(heat[5], 0.0);
        assert_eq!(wetness[5], 0.0);
        assert_eq!(fuel[5], 0.0);
        assert_eq!(age[5], 0);
    }

    #[test]
    fn phase_changes_are_deterministic_for_identical_worlds() {
        let mut first = vec![0u8; 64];
        first[18] = 2;
        first[27] = 8;
        first[36] = 9;
        let mut second = first.clone();
        let age = vec![17u16; 64];

        for _ in 0..500 {
            step_phase_changes(&mut first, &age, 240.0, 8, 8);
            step_phase_changes(&mut second, &age, 240.0, 8, 8);
        }

        assert_eq!(first, second);
    }

    #[test]
    fn thermal_step_advances_age_and_keeps_air_temperatures_finite() {
        let mut cells = vec![0u8; 25];
        cells[12] = 5; // Fire
        cells[13] = 1; // Sand
        let mut wetness = vec![0.0f32; 25];
        let mut heat = vec![20.0f32; 25];
        let mut air = vec![20.0f32; 25];
        let mut next_air = vec![20.0f32; 25];
        let mut fuel = vec![0.0f32; 25];
        let mut burn = vec![0.0f32; 25];
        let mut age = vec![0u16; 25];
        let mut corrosion = vec![0.0f32; 25];

        step_material_thermal(&cells, &mut wetness, &mut heat, &mut air,
            &mut next_air, &mut fuel, &mut burn, &mut age, &mut corrosion,
            20.0, 5, 5);

        assert_eq!(age[12], 1);
        assert_eq!(age[13], 1);
        assert!(air.iter().all(|value| value.is_finite()));
        assert!(heat.iter().all(|value| value.is_finite()));
        assert!(air[12] > 20.0);
    }
}


#[cfg(test)]
mod combustion_tests {
    use super::{prime_fuse_ignition, step_combustion, step_material_thermal};

    #[test]
    fn fuse_ignites_when_touching_fire_before_particle_motion() {
        let mut cells = vec![0u8; 25];
        cells[12] = 5;
        cells[13] = 17;
        let mut heat = vec![0.0f32; 25];
        let mut fuel = vec![0.0f32; 25];
        let mut burn = vec![0.0f32; 25];

        prime_fuse_ignition(&cells, &mut heat, &mut fuel, &mut burn, 5, 5);

        assert!(burn[13] > 0.0);
        assert!(fuel[13] > 0.0);
        assert!(heat[13] >= 900.0);
    }

    #[test]
    fn combustion_advances_fire_and_returns_detonation_count() {
        let mut cells = vec![0u8; 25];
        cells[12] = 5;
        let mut heat = vec![0.0f32; 25];
        let wetness = vec![0.0f32; 25];
        let mut fuel = vec![0.0f32; 25];
        let mut burn = vec![0.0f32; 25];
        let age = vec![0u16; 25];

        let detonations = step_combustion(&mut cells, &mut heat, &wetness,
            &mut fuel, &mut burn, &age, 20.0, 5, 5);

        assert_eq!(detonations, 0);
        assert!(burn[12] > 0.0);
        assert!(heat[12] >= 700.0);
    }

    #[test]
    fn thermal_step_clears_chemistry_for_empty_cells() {
        let cells = vec![0u8; 4];
        let mut wetness = vec![0.8f32; 4];
        let mut heat = vec![100.0f32; 4];
        let mut air = vec![80.0f32; 4];
        let mut next_air = vec![80.0f32; 4];
        let mut fuel = vec![0.5f32; 4];
        let mut burn = vec![0.5f32; 4];
        let mut age = vec![12u16; 4];
        let mut corrosion = vec![2.0f32; 4];

        step_material_thermal(&cells, &mut wetness, &mut heat, &mut air,
            &mut next_air, &mut fuel, &mut burn, &mut age, &mut corrosion,
            20.0, 2, 2);

        for i in 0..4 {
            assert_eq!(wetness[i], 0.0);
            assert_eq!(heat[i], 0.0);
            assert_eq!(fuel[i], 0.0);
            assert_eq!(burn[i], 0.0);
            assert_eq!(age[i], 0);
            assert_eq!(corrosion[i], 0.0);
        }
    }
}
