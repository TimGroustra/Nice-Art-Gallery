# Nice Art Gallery – Unity Layout

## How to use

1. **Create a Unity project** (2022.3 LTS or later recommended).  
2. Copy the entire `unity` folder into the root of your project (`Assets/` will merge automatically).  
3. In the Hierarchy, **right‑click → Create Empty** and name it `GalleryBuilder`.  
4. Drag the `GalleryLayoutGenerator` script onto the `GalleryBuilder` GameObject.  
5. Press **Play**. The script will procedurally generate:

   * All walls, floors, ceilings (with correct dimensions)  
   * Collision boxes (Unity automatically adds `BoxCollider`s on the cubes)  
   * Door markers (yellow spheres) for reference – you can replace them with actual door prefabs.  
   * Ambient lighting + per‑room spotlights.  
   * Neon edge strips in the Feature Room and Neon Corridor.

6. The generated objects are **static** – enable Unity’s static batching for best performance.  
7. If you need actual door meshes, replace the marker objects (`*_Marker`) with your own prefabs and set their colliders as required.

## Material IDs

The script creates runtime materials with the following identifiers (view them in the **Project → Materials** window after Play):

| Material ID | Description |
|-------------|-------------|
| `WallWhite` | Matte white gallery walls |
| `WallGraphite` | Dark graphite accent walls |
| `FloorPolishedConcrete` | Light‑grey polished concrete floor |
| `FloorResin` | Dark resin floor (Feature Room) |
| `NeonBlue` / `NeonMagenta` | Neon edge strips |
| `DigitalLED` | Backing material for the LED wall zone |

Replace these runtime materials with your own textures by editing `CreateMaterial()` in `GalleryLayoutGenerator.cs`.

---

## 2️⃣ Unreal Engine – C++ layout actor  

### File: `unreal/Source/NiceArtGallery/Public/GalleryLayoutActor.h`

<dyad-write path="unreal/Source/NiceArtGallery/Public/GalleryLayoutActor.h" description="Header for the Unreal C++ actor that builds the gallery layout">
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GalleryLayoutActor.generated.h"

/**
 * A single AActor that, when placed in a level, procedurally creates
 * the Nice Art Gallery floor‑plan, walls, floors, doors, collision
 * meshes and lighting according to the blueprint.
 *
 * The geometry uses simple UStaticMeshComponent cubes (Box meshes) and
 * plane meshes for floors/ceilings. Materials are created at runtime and
 * assigned IDs that you can replace with actual assets in the editor.
 */
UCLASS()
class NICEARTGALLERY_API AGalleryLayoutActor : public AActor
{
	GENERATED_BODY()
	
public:	
	AGalleryLayoutActor();

protected:
	virtual void BeginPlay() override;

private:
	/** Helper to create a material with a given color (used for IDs) */
	UMaterialInstanceDynamic* CreateMaterial(FLinearColor Color, const FString& Name);

	/** Build a rectangular room (walls, floor, ceiling) */
	void BuildRoom(const FString& Name,
	               const FVector2D& Pos,          // X,Y in meters (ground plane)
	               const FVector2D& Size,         // Width, Depth in meters
	               float Height,                  // Ceiling height in meters
	               UMaterialInterface* WallMat,
	               UMaterialInterface* FloorMat,
	               bool bHasNeon = false);

	/** Add a simple door marker (for reference) */
	void AddDoorMarker(const FString& DoorName, const FVector& Center, float Width);

	/** Create ambient lighting for the whole level */
	void CreateAmbientLight();

	/** Create per‑room spotlights */
	void CreateRoomLighting(const FString& RoomName,
	                       const FVector2D& Pos,
	                       const FVector2D& Size,
	                       float Height,
	                       bool bHasNeon);
};