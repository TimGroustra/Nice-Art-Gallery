#include "GalleryLayoutActor.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/Engine.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/World.h"
#include "Engine/EngineTypes.h"
#include "Engine/StaticMeshActor.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/ChildActorComponent.h"
#include "Engine/PointLight.h"
#include "Engine/SpotLight.h"

AGalleryLayoutActor::AGalleryLayoutActor()
{
	PrimaryActorTick.bCanEverTick = false;
}

void AGalleryLayoutActor::BeginPlay()
{
	Super::BeginPlay();

	// -------------------------------------------------
	// 1️⃣ Define material IDs (runtime generated)
	// -------------------------------------------------
	auto WallWhite      = CreateMaterial(FLinearColor::White, TEXT("WallWhite"));
	auto WallGraphite   = CreateMaterial(FLinearColor(0.12f, 0.12f, 0.12f), TEXT("WallGraphite"));
	auto FloorConcrete  = CreateMaterial(FLinearColor(0.75f, 0.75f, 0.75f), TEXT("FloorConcrete"));
	auto FloorResin     = CreateMaterial(FLinearColor(0.05f, 0.05f, 0.07f), TEXT("FloorResin"));
	auto NeonBlue       = CreateMaterial(FLinearColor(0.f, 0.6f, 1.f), TEXT("NeonBlue"));
	auto NeonMagenta    = CreateMaterial(FLinearColor(1.f, 0.f, 0.75f), TEXT("NeonMagenta"));
	auto DigitalLED    = CreateMaterial(FLinearColor(0.1f, 0.1f, 0.1f), TEXT("DigitalLED"));

	// -------------------------------------------------
	// 2️⃣ Build all rooms (position = bottom‑left corner in meters)
	// -------------------------------------------------
	struct FRoomDef
	{
		FString Name;
		FVector2D Pos;
		FVector2D Size;
		float Height;
		UMaterialInterface* WallMat;
		UMaterialInterface* FloorMat;
		bool bNeon;
	};

	TArray<FRoomDef> Rooms;
	Rooms.Add({ TEXT("Main Exhibition Hall"), FVector2D(0.f, 5.f), FVector2D(30.f, 30.f), 4.5f, WallWhite, FloorConcrete, false });
	Rooms.Add({ TEXT("Rotating Gallery"), FVector2D(30.f, 25.f), FVector2D(15.f, 20.f), 4.5f, WallWhite, FloorConcrete, false });
	Rooms.Add({ TEXT("Feature Room"), FVector2D(0.f, 35.f), FVector2D(15.f, 20.f), 6.0f, WallGraphite, FloorResin, true });
	Rooms.Add({ TEXT("Neon Corridor"), FVector2D(15.f, 35.f), FVector2D(15.f, 20.f), 4.0f, WallWhite, FloorConcrete, true });
	Rooms.Add({ TEXT("Digital Art Wall"), FVector2D(0.f, 0.f), FVector2D(15.f, 5.f), 4.5f, WallWhite, DigitalLED, false });
	Rooms.Add({ TEXT("Reception"), FVector2D(15.f, 0.f), FVector2D(10.f, 5.f), 4.5f, WallWhite, FloorConcrete, false });
	Rooms.Add({ TEXT("Shop"), FVector2D(25.f, 0.f), FVector2D(10.f, 5.f), 4.5f, WallWhite, FloorConcrete, false });
	Rooms.Add({ TEXT("Storage"), FVector2D(35.f, 0.f), FVector2D(10.f, 5.f), 4.5f, WallWhite, FloorConcrete, false });
	Rooms.Add({ TEXT("WC"), FVector2D(45.f, 0.f), FVector2D(5.f, 5.f), 4.5f, WallWhite, FloorConcrete, false });

	for (const FRoomDef& R : Rooms)
	{
		BuildRoom(R.Name, R.Pos, R.Size, R.Height, R.WallMat, R.FloorMat, R.bNeon);
		CreateRoomLighting(R.Name, R.Pos, R.Size, R.Height, R.bNeon);
	}

	// -------------------------------------------------
	// 3️⃣ Door markers (visual placeholders; replace with actual doors)
	// -------------------------------------------------
	AddDoorMarker(TEXT("Entrance"), FVector(17.f, 0.f, 0.f), 2.f);
	AddDoorMarker(TEXT("ReceptionToHall"), FVector(20.f, 0.f, 5.f), 2.f);
	AddDoorMarker(TEXT("HallToCorridor"), FVector(20.f, 0.f, 35.f), 2.f);
	AddDoorMarker(TEXT("CorridorToFeature"), FVector(22.5f, 0.f, 45.f), 1.5f);
	AddDoorMarker(TEXT("CorridorToRotating"), FVector(20.f, 0.f, 45.f), 1.5f);
	AddDoorMarker(TEXT("BackOfHouse"), FVector(38.f, 0.f, 2.5f), 1.f);

	// -------------------------------------------------
	// 4️⃣ Global ambient light
	// -------------------------------------------------
	CreateAmbientLight();
}

// -------------------------------------------------------------------
// Helper: create a simple material with a solid color (runtime ID)
// -------------------------------------------------------------------
UMaterialInstanceDynamic* AGalleryLayoutActor::CreateMaterial(FLinearColor Color, const FString& Name)
{
	// Use the Engine’s BasicShape material as a base (installed with UE)
	static ConstructorHelpers::FObjectFinder<UMaterial> BaseMat(TEXT("/Engine/EngineMaterials/DefaultMaterial"));
	UMaterialInstanceDynamic* DynMat = UMaterialInstanceDynamic::Create(BaseMat.Object, this);
	DynMat->SetVectorParameterValue(FName(TEXT("BaseColor")), Color);
	DynMat->SetScalarParameterValue(FName(TEXT("Roughness")), (Name.Contains(TEXT("Wall")) || Name.Contains(TEXT("DigitalLED"))) ? 0.8f : 0.2f);
	DynMat->Rename(*Name);
	return DynMat;
}

// -------------------------------------------------------------------
// Build a rectangular room (walls, floor, ceiling)
// -------------------------------------------------------------------
void AGalleryLayoutActor::BuildRoom(const FString& Name,
                                   const FVector2D& Pos,
                                   const FVector2D& Size,
                                   float Height,
                                   UMaterialInterface* WallMat,
                                   UMaterialInterface* FloorMat,
                                   bool bHasNeon)
{
	// Helper to spawn a static mesh component (box) and attach to the Actor
	auto SpawnBox = [&](const FVector& Location, const FVector& Extent, UMaterialInterface* Mat, const FString& CompName)
	{
		UStaticMeshComponent* Box = NewObject<UStaticMeshComponent>(this, *CompName);
		Box->RegisterComponent();
		Box->SetWorldLocation(Location);
		Box->SetWorldScale3D(Extent / 50.f); // UE BoxExtent is half‑size in cm; we scale from meters
		static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeMesh(TEXT("/Engine/BasicShapes/Cube"));
		Box->SetStaticMesh(CubeMesh.Object);
		Box->SetMaterial(0, Mat);
		Box->SetCollisionProfileName(TEXT("BlockAll"));
		Box->AttachToComponent(RootComponent, FAttachmentTransformRules::KeepWorldTransform);
		return Box;
	};

	// Helper to spawn a plane (floor / ceiling)
	auto SpawnPlane = [&](const FVector& Location, const FVector2D& PlaneSize, const FRotator& Rot,
	                       UMaterialInterface* Mat, const FString& CompName)
	{
		UStaticMeshComponent* Plane = NewObject<UStaticMeshComponent>(this, *CompName);
		Plane->RegisterComponent();
		Plane->SetWorldLocation(Location);
		Plane->SetWorldRotation(Rot);
		float scaleX = PlaneSize.X / 100.f; // Plane mesh is 100x100 cm
		float scaleY = PlaneSize.Y / 100.f;
		Plane->SetWorldScale3D(FVector(scaleX, scaleY, 1.f));
		static ConstructorHelpers::FObjectFinder<UStaticMesh> PlaneMesh(TEXT("/Engine/BasicShapes/Plane"));
		Plane->SetStaticMesh(PlaneMesh.Object);
		Plane->SetMaterial(0, Mat);
		Plane->SetCollisionProfileName(TEXT("BlockAll"));
		Plane->AttachToComponent(RootComponent, FAttachmentTransformRules::KeepWorldTransform);
		return Plane;
	};

	// Origin is bottom‑left corner (X forward, Y right, Z up)
	const float HalfWallThickness = 0.15f; // 30 cm thick wall (half‑extents in meters)

	// Floor
	SpawnPlane(FVector(Pos.X + Size.X/2.f, Pos.Y + Size.Y/2.f, 0.f),
	           FVector2D(Size.X, Size.Y),
	           FRotator(0.f, 0.f, 0.f),
	           FloorMat,
	           Name + TEXT("_Floor"));

	// Ceiling
	SpawnPlane(FVector(Pos.X + Size.X/2.f, Pos.Y + Size.Y/2.f, Height),
	           FVector2D(Size.X, Size.Y),
	           FRotator(180.f, 0.f, 0.f),
	           WallMat,
	           Name + TEXT("_Ceiling"));

	// Walls (four sides). Extent = half‑size (in cm) for BoxComponent.
	// North wall (positive Y)
	SpawnBox(FVector(Pos.X + Size.X/2.f, Pos.Y + Size.Y, Height/2.f),
	         FVector(Size.X/2.f, HalfWallThickness, Height/2.f),
	         WallMat, Name + TEXT("_Wall_North"));
	// South wall (Y = 0)
	SpawnBox(FVector(Pos.X + Size.X/2.f, Pos.Y, Height/2.f),
	         FVector(Size.X/2.f, HalfWallThickness, Height/2.f),
	         WallMat, Name + TEXT("_Wall_South"));
	// West wall (X = 0)
	SpawnBox(FVector(Pos.X, Pos.Y + Size.Y/2.f, Height/2.f),
	         FVector(HalfWallThickness, Size.Y/2.f, Height/2.f),
	         WallMat, Name + TEXT("_Wall_West"));
	// East wall (X = Size.X)
	SpawnBox(FVector(Pos.X + Size.X, Pos.Y + Size.Y/2.f, Height/2.f),
	         FVector(HalfWallThickness, Size.Y/2.f, Height/2.f),
	         WallMat, Name + TEXT("_Wall_East"));

	// OPTIONAL: Neon edge strips (simple thin boxes with emissive material)
	if (bHasNeon)
	{
		UMaterialInstanceDynamic* NeonMat = CreateMaterial(FLinearColor::Cyan, Name + TEXT("_NeonMat"));
		NeonMat->SetScalarParameterValue(FName(TEXT("EmissiveStrength")), 10.f);
		// Bottom strip (floor‑level)
		float StripHeight = 0.05f;
		float StripThickness = 0.02f;

		// West strip
		SpawnBox(FVector(Pos.X + StripThickness/2.f, Pos.Y + Size.Y/2.f, StripHeight/2.f),
		         FVector(StripThickness/2.f, Size.Y/2.f, StripHeight/2.f),
		         NeonMat, Name + TEXT("_Neon_West"));
		// East strip
		SpawnBox(FVector(Pos.X + Size.X - StripThickness/2.f, Pos.Y + Size.Y/2.f, StripHeight/2.f),
		         FVector(StripThickness/2.f, Size.Y/2.f, StripHeight/2.f),
		         NeonMat, Name + TEXT("_Neon_East"));
		// North strip
		SpawnBox(FVector(Pos.X + Size.X/2.f, Pos.Y + Size.Y - StripThickness/2.f, StripHeight/2.f),
		         FVector(Size.X/2.f, StripThickness/2.f, StripHeight/2.f),
		         NeonMat, Name + TEXT("_Neon_North"));
		// South strip
		SpawnBox(FVector(Pos.X + Size.X/2.f, Pos.Y + StripThickness/2.f, StripHeight/2.f),
		         FVector(Size.X/2.f, StripThickness/2.f, StripHeight/2.f),
		         NeonMat, Name + TEXT("_Neon_South"));
	}
}

// -------------------------------------------------------------------
// Add a simple door marker (a thin cylinder) – visual placeholder
// -------------------------------------------------------------------
void AGalleryLayoutActor::AddDoorMarker(const FString& DoorName, const FVector& Center, float Width)
{
	UStaticMeshComponent* Marker = NewObject<UStaticMeshComponent>(this, *DoorName);
	Marker->RegisterComponent();
	Marker->SetWorldLocation(Center);
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderMesh(TEXT("/Engine/BasicShapes/Cylinder"));
	Marker->SetStaticMesh(CylinderMesh.Object);
	Marker->SetWorldScale3D(FVector(Width/100.f, 0.05f, 0.01f)); // thin disc
	UMaterialInstanceDynamic* Mat = CreateMaterial(FLinearColor::Yellow, DoorName + TEXT("_Mat"));
	Marker->SetMaterial(0, Mat);
	Marker->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Marker->AttachToComponent(RootComponent, FAttachmentTransformRules::KeepWorldTransform);
}

// -------------------------------------------------------------------
// Ambient lighting (global sky‑like light)
// -------------------------------------------------------------------
void AGalleryLayoutActor::CreateAmbientLight()
{
	// UE doesn’t have a built‑in ambient light actor, we set the skylight.
	ASkyLight* Sky = GetWorld()->SpawnActor<ASkyLight>(FVector::ZeroVector, FRotator::ZeroRotator);
	if (Sky)
	{
		Sky->GetLightComponent()->Intensity = 0.3f;
		Sky->GetLightComponent()->LightColor = FColor(64, 64, 70);
	}
}

// -------------------------------------------------------------------
// Per‑room spotlights (four corners) + optional neon glow point
// -------------------------------------------------------------------
void AGalleryLayoutActor::CreateRoomLighting(const FString& RoomName,
                                            const FVector2D& Pos,
                                            const FVector2D& Size,
                                            float Height,
                                            bool bHasNeon)
{
	// Spotlights (one per corner, angled downwards)
	TArray<FVector> Corners = {
		FVector(Pos.X + 0.5f, Pos.Y + 0.5f, Height - 0.5f),
		FVector(Pos.X + Size.X - 0.5f, Pos.Y + 0.5f, Height - 0.5f),
		FVector(Pos.X + 0.5f, Pos.Y + Size.Y - 0.5f, Height - 0.5f),
		FVector(Pos.X + Size.X - 0.5f, Pos.Y + Size.Y - 0.5f, Height - 0.5f)
	};

	for (int32 i = 0; i < Corners.Num(); ++i)
	{
		ASpotLight* Spot = GetWorld()->SpawnActor<ASpotLight>(Corners[i], FRotator(-90.f, 0.f, 0.f));
		if (Spot)
		{
			Spot->SetActorLabel(RoomName + TEXT("_Spot_") + FString::FromInt(i));
			Spot->GetLightComponent()->Intensity = 5000.f;
			Spot->GetLightComponent()->AttenuationRadius = FMath::Max(Size.X, Size.Y) * 100.f;
			Spot->GetLightComponent()->LightColor = FColor::FromHex(TEXT("#F9F5EB"));
			Spot->GetLightComponent()->InnerConeAngle = 30.f;
			Spot->GetLightComponent()->OuterConeAngle = 45.f;
		}
	}

	// Optional neon point light (soft glow)
	if (bHasNeon)
	{
		FVector NeonPos = FVector(Pos.X + Size.X/2.f, Pos.Y + Size.Y/2.f, Height - 0.2f);
		APointLight* Neon = GetWorld()->SpawnActor<APointLight>(NeonPos, FRotator::ZeroRotator);
		if (Neon)
		{
			Neon->SetActorLabel(RoomName + TEXT("_NeonGlow"));
			Neon->GetLightComponent()->Intensity = 2000.f;
			Neon->GetLightComponent()->AttenuationRadius = FMath::Max(Size.X, Size.Y) * 80.f;
			Neon->GetLightComponent()->LightColor = bHasNeon ? (RoomName.Contains(TEXT("Corridor")) ? FColor::Cyan : FColor::Magenta) 
			                                            : FColor::White;
		}
	}
}