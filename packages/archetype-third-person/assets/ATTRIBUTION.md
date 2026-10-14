# Art attribution — @waica/archetype-third-person

Every file in this directory is Creative Commons Zero (CC0 1.0 Universal,
http://creativecommons.org/publicdomain/zero/1.0/) work by **Kay Lousberg**
(www.kaylousberg.com), from the KayKit packs below. Each pack's
`LICENSE.txt` says the content "is free to use in personal, educational and
commercial projects"; crediting the author is not mandatory, and this file
does it anyway. The packs were read from their GitHub repositories at the
commits named here; the two characters were trimmed with this repository's
dependency-free trimmer, which records what it kept and dropped in each
glb's `asset.extras`. The dungeon pieces are the pack's self-contained
`.gltf.glb` files (texture embedded), copied byte for byte and renamed.

## `knight.glb` — KayKit Character Pack: Adventurers (1.0)

- **Source:** `addons/kaykit_character_pack_adventures/Characters/gltf/Knight.glb`
  of https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
  at commit `672074b73ba276876a19e8816ecdc5241817ab47` (3,659,532 bytes, 76
  clips; sha256 `60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168`).
- **License:** CC0 1.0 (the pack's `LICENSE.txt`).
- **Kept:** the eight clips the `character` role's states name — `Idle`,
  `Walking_A`, `Running_A`, `Jump_Start`, `Jump_Idle`,
  `1H_Melee_Attack_Chop`, `Dodge_Forward`, `Death_A` — and one sword and one
  shield (the other hand-slot gear is dropped). 623,236 bytes.
- **Trim command:**

  ```sh
  node scripts/trim-character-glb.mjs Knight.glb packages/archetype-third-person/assets/knight.glb \
    --keep-clips Idle,Walking_A,Running_A,Jump_Start,Jump_Idle,1H_Melee_Attack_Chop,Dodge_Forward,Death_A \
    --drop-nodes 1H_Sword_Offhand,Badge_Shield,Rectangle_Shield,Spike_Shield,2H_Sword
  ```

## `skeleton-warrior.glb` — KayKit Character Pack: Skeletons (1.0)

- **Source:** `addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Warrior.glb`
  of https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0
  at commit `15b62b9bad122f72926c10fb14d622c73819fa54` (4,863,620 bytes, 95
  clips; sha256 `178b6fda810b814c250d8a2010c24dfd9b458b9006dd323353e620b7ff118bbe`).
- **License:** CC0 1.0 (the pack's `LICENSE.txt`).
- **Kept:** the six clips the `enemy` role's states name — `Walking_A`
  (patrol), `Running_A` (chase), `2H_Melee_Idle` (windup),
  `1H_Melee_Attack_Chop` (attack), `Hit_A` (hurt), `Death_A` (die). No node
  is dropped. 614,288 bytes.
- **Trim command:**

  ```sh
  node scripts/trim-character-glb.mjs Skeleton_Warrior.glb packages/archetype-third-person/assets/skeleton-warrior.glb \
    --keep-clips Walking_A,Running_A,2H_Melee_Idle,1H_Melee_Attack_Chop,Hit_A,Death_A
  ```

## Dungeon pieces — KayKit Dungeon Remastered (1.0)

From `addons/kaykit_dungeon_remastered/Assets/gltf/` of
https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 at commit
`b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07`. License: CC0 1.0 (the pack's
`LICENSE.txt`). Not trimmed: each is copied as is (`cp <source> <file>`).

| File | Source | Bytes | sha256 |
|---|---|---:|---|
| `dungeon-wall.glb` | `wall.gltf.glb` | 53,132 | `f2f343a7bdf2d45947e3f354494e16095a923485e05637e3804e3b81ce11d921` |
| `dungeon-floor.glb` | `floor_tile_large.gltf.glb` | 28,100 | `5b6bbbc683f6729d094732056f157a928435de97ec3cf94c341c7465907fe17b` |
| `dungeon-foundation.glb` | `floor_foundation_allsides.gltf.glb` | 44,944 | `5b167b3f5fbc0d8a61c5681d028590e78f27f15ff3da3e171ba9c898ed051408` |
| `dungeon-pillar.glb` | `pillar.gltf.glb` | 25,552 | `e31da496461921475384c62ce761cd23924892bd6f32aeea68bd913545caee33` |
| `dungeon-torch.glb` | `torch_mounted.gltf.glb` | 33,220 | `a617c159e02932db48ca81ec46f1f100acc8904fb6ece43e919d2f93c13950e9` |
| `dungeon-chest.glb` | `chest.glb` | 81,412 | `f72fd2201cd42ad399928a0b7bcc34d5b0e6d0624aeaf824fef81852109955f8` |
| `dungeon-banner.glb` | `banner_blue.gltf.glb` | 24,216 | `219995a647a17a506770f998b2194e882e3c078753cebe37e608e2b65ed14d5a` |
