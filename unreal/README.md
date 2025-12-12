# Nice Art Gallery – Unreal Engine Layout

## Overview
`AGalleryLayoutActor` is an **editor‑time / runtime** actor that procedurally creates the full gallery floor‑plan from the architectural blueprint:

* Walls, floors, ceilings (exact dimensions)  
* Collision meshes (BoxComponents) – ready for player navigation or VR  
* Material IDs (`WallWhite`, `WallGraphite`, `FloorConcrete`, `FloorResin`, `NeonBlue`, `NeonMagenta`, `DigitalLED`) – you can replace these at runtime with your own assets.  
* Global skylight + per‑room spotlights + optional neon glow points.  
* Simple door **marker** actors (yellow cylinders) – replace with proper door meshes.

## How to add to a project

1. **Create a new C++ project** (or open an existing one).  
2. Copy the entire `unreal` folder into the root of the project (it will become `YourProject/Source/NiceArtGallery/…`).  
3. Open **Visual Studio / Rider** and let it generate project files (`GenerateProjectFiles.bat` on Windows or `./GenerateProjectFiles.sh` on macOS/Linux).  
4. Build the solution – the `NiceArtGallery` module will compile.  

   In Visual Studio simply press **Build → Build Solution**.  
   In the UE editor you should see **“NiceArtGallery”** appear under *Plugins* → *C++ Modules*.

5. In the editor, **drag `AGalleryLayoutActor`** from the *Place Actors* panel into your level.  
6. Hit **Play** – the layout will appear at the origin (0,0,0).  
7. To adjust the size/position you can edit the hard‑coded values in `GalleryLayoutActor.cpp` (rooms are defined in the `Rooms` array).  

## Replacing Materials

The runtime materials are created in `CreateMaterial()`.  
If you have proper PBR textures, replace the following line in `CreateMaterial()`:

```cpp
static ConstructorHelpers::FObjectFinder<UMaterial> BaseMat(TEXT("/Engine/EngineMaterials/DefaultMaterial"));
```

with a reference to a material that contains your texture slots, then set the parameters (BaseColor, Roughness, etc.) as needed.

## Adding Real Doors

The script currently spawns a **cylinder marker** for each door.  
To use a proper door:

1. Create a **Blueprint** or **C++** door actor (static mesh + collision).  
2. In `AddDoorMarker()` replace the cylinder spawning code with `GetWorld()->SpawnActor<AYourDoor>(Location, Rotation);`.  
3. Remove the cylinder material or hide the marker.

## FAQ

| Question | Answer |
|----------|--------|
| *Can I use this in a packaged build?* | Yes – the geometry is generated at runtime, so it works in Shipping builds. |
| *Is the layout editable after generation?* | All generated components are normal `UStaticMeshComponent`s, so you can move/scale them in‑editor after the actor spawns. |
| *How do I change room dimensions?* | Edit the `FRoomDef` entries in `BeginPlay()` – each entry uses meters. |
| *What about VR collision?* | The walls and floor use `BlockAll` collision profiles, suitable for default VR pawn capsules. |

Enjoy your neon‑lit, museum‑grade gallery!  

---  

If you need any additional features (e.g., NavMesh generation, dynamic artwork loading, or export to FBX), just let me know.