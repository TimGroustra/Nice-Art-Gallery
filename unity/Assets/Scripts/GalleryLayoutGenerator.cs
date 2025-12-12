using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Attach this script to an empty GameObject in a Unity scene.
/// When the scene starts it will procedurally generate the entire
/// Nice Art Gallery layout (walls, floors, doors, lights) as
/// described in the architectural blueprint.
/// </summary>
public class GalleryLayoutGenerator : MonoBehaviour
{
    #region Material IDs (generated at runtime)

    private Material matWallWhite;
    private Material matWallGraphite;
    private Material matFloorPolishedConcrete;
    private Material matFloorResin;
    private Material matNeonBlue;
    private Material matNeonMagenta;
    private Material matDigitalLED;

    #endregion

    #region Data structures

    private struct Room
    {
        public string Name;
        public Vector2 Position;   // X,Z (meters)
        public Vector2 Size;       // width, depth (meters)
        public float Height;       // meters
        public Material WallMaterial;
        public Material FloorMaterial;
        public bool HasNeon;       // true for Neon Corridor & Feature Room

        public Room(string name, Vector2 pos, Vector2 size, float height,
                    Material wallMat, Material floorMat, bool neon = false)
        {
            Name = name;
            Position = pos;
            Size = size;
            Height = height;
            WallMaterial = wallMat;
            FloorMaterial = floorMat;
            HasNeon = neon;
        }
    }

    #endregion

    private void Awake()
    {
        CreateMaterials();
        GenerateLayout();
    }

    #region Material creation (Material IDs)

    private void CreateMaterials()
    {
        // Simple unlit color materials – replace with proper textures later.
        matWallWhite        = CreateMaterial(Color.white,    "WallWhite");
        matWallGraphite     = CreateMaterial(new Color(0.12f,0.12f,0.12f), "WallGraphite");
        matFloorPolishedConcrete = CreateMaterial(new Color(0.75f,0.75f,0.75f), "FloorPolishedConcrete");
        matFloorResin       = CreateMaterial(new Color(0.05f,0.05f,0.07f), "FloorResin");
        matNeonBlue         = CreateMaterial(new Color(0.0f,0.6f,1.0f), "NeonBlue");
        matNeonMagenta      = CreateMaterial(new Color(1.0f,0.0f,0.75f), "NeonMagenta");
        matDigitalLED       = CreateMaterial(new Color(0.1f,0.1f,0.1f), "DigitalLED"); // dark matte for LED wall backing
    }

    private Material CreateMaterial(Color color, string name)
    {
        var mat = new Material(Shader.Find("Standard"));
        mat.name = name;
        mat.color = color;
        // High smoothness for polished concrete, low for walls
        mat.SetFloat("_Glossiness", name.Contains("PolishedConcrete") ? 0.8f : 0.2f);
        return mat;
    }

    #endregion

    #region Layout generation

    private void GenerateLayout()
    {
        // -------------------------------------------------
        // 1️⃣ Define all rooms based on the blueprint data
        // -------------------------------------------------
        var rooms = new List<Room>
        {
            // Main Exhibition Hall
            new Room(
                "Main Exhibition Hall",
                new Vector2(0f, 5f),
                new Vector2(30f, 30f),
                4.5f,
                matWallWhite,
                matFloorPolishedConcrete),

            // Rotating Gallery
            new Room(
                "Rotating Gallery",
                new Vector2(30f, 25f),
                new Vector2(15f, 20f),
                4.5f,
                matWallWhite,
                matFloorPolishedConcrete),

            // Feature Room (immersive)
            new Room(
                "Feature Room",
                new Vector2(0f, 35f),
                new Vector2(15f, 20f),
                6.0f,
                matWallGraphite,
                matFloorResin,
                neon:true),

            // Neon Corridor (brand experience)
            new Room(
                "Neon Corridor",
                new Vector2(15f, 35f),
                new Vector2(15f, 20f),
                4.0f,
                matWallWhite,
                matFloorPolishedConcrete,
                neon:true),

            // Digital Art Wall Zone
            new Room(
                "Digital Art Wall",
                new Vector2(0f, 0f),
                new Vector2(15f, 5f),
                4.5f,
                matWallWhite,
                matDigitalLED),

            // Reception (glass partition)
            new Room(
                "Reception",
                new Vector2(15f, 0f),
                new Vector2(10f, 5f),
                4.5f,
                matWallWhite,
                matFloorPolishedConcrete),

            // Shop
            new Room(
                "Shop",
                new Vector2(25f, 0f),
                new Vector2(10f, 5f),
                4.5f,
                matWallWhite,
                matFloorPolishedConcrete),

            // Storage/Prep
            new Room(
                "Storage",
                new Vector2(35f, 0f),
                new Vector2(10f, 5f),
                4.5f,
                matWallWhite,
                matFloorPolishedConcrete),

            // WC Block
            new Room(
                "WC",
                new Vector2(45f, 0f),
                new Vector2(5f, 5f),
                4.5f,
                matWallWhite,
                matFloorPolishedConcrete)
        };

        // -------------------------------------------------
        // 2️⃣ Build each room – walls, floor, ceiling
        // -------------------------------------------------
        foreach (var room in rooms)
        {
            BuildRoom(room);
        }

        // -------------------------------------------------
        // 3️⃣ Add doors & circulation openings
        // -------------------------------------------------
        AddDoor("Entrance",    new Vector2(17f, 0f), 2f, "Reception",   "Digital Art Wall");
        AddDoor("Reception→Hall", new Vector2(20f, 5f), 2f, "Reception",  "Main Exhibition Hall");
        AddDoor("Hall→Corridor", new Vector2(20f, 35f), 2f, "Main Exhibition Hall", "Neon Corridor");
        AddDoor("Corridor→Feature", new Vector2(22.5f, 45f), 1.5f, "Neon Corridor", "Feature Room");
        AddDoor("Corridor→Rotating", new Vector2(20f, 45f), 1.5f, "Neon Corridor", "Rotating Gallery");
        AddDoor("Back‑of‑house", new Vector2(38f, 2.5f), 1f, "Storage", "Shop");

        // -------------------------------------------------
        // 4️⃣ Global lighting (ambient + per‑room accent)
        // -------------------------------------------------
        CreateAmbientLight();

        foreach (var room in rooms)
        {
            CreateRoomLighting(room);
        }
    }

    #endregion

    #region Helper – room construction

    private void BuildRoom(Room room)
    {
        // Floor (Plane)
        var floor = GameObject.CreatePrimitive(PrimitiveType.Plane);
        floor.name = $"{room.Name}_Floor";
        floor.transform.localScale = new Vector3(room.Size.x / 10f, 1, room.Size.y / 10f); // Unity plane = 10×10 units
        floor.transform.position = new Vector3(room.Position.x + room.Size.x / 2f,
                                                0f,
                                                room.Position.y + room.Size.y / 2f);
        floor.GetComponent<Renderer>().sharedMaterial = room.FloorMaterial;
        floor.isStatic = true;
        // Add BoxCollider for floor (already present on Plane)

        // Ceiling (another plane, flipped)
        var ceiling = GameObject.CreatePrimitive(PrimitiveType.Plane);
        ceiling.name = $"{room.Name}_Ceiling";
        ceiling.transform.localScale = floor.transform.localScale;
        ceiling.transform.position = new Vector3(floor.transform.position.x,
                                                room.Height,
                                                floor.transform.position.z);
        ceiling.transform.rotation = Quaternion.Euler(180f, 0f, 0f); // flip downwards
        ceiling.GetComponent<Renderer>().sharedMaterial = room.WallMaterial; // simple ceiling material
        ceiling.isStatic = true;

        // Four walls – built from scaled Cube primitives
        BuildWall($"{room.Name}_Wall_North",
                 new Vector3(room.Position.x + room.Size.x / 2f, room.Height / 2f, room.Position.y),
                 new Vector3(room.Size.x, room.Height, 0.3f),
                 room.WallMaterial);

        BuildWall($"{room.Name}_Wall_South",
                 new Vector3(room.Position.x + room.Size.x / 2f, room.Height / 2f, room.Position.y + room.Size.y),
                 new Vector3(room.Size.x, room.Height, 0.3f),
                 room.WallMaterial);

        BuildWall($"{room.Name}_Wall_West",
                 new Vector3(room.Position.x, room.Height / 2f, room.Position.y + room.Size.y / 2f),
                 new Vector3(0.3f, room.Height, room.Size.y),
                 room.WallMaterial);

        BuildWall($"{room.Name}_Wall_East",
                 new Vector3(room.Position.x + room.Size.x, room.Height / 2f, room.Position.y + room.Size.y / 2f),
                 new Vector3(0.3f, room.Height, room.Size.y),
                 room.WallMaterial);

        // If the room needs neon accents, add edge strips
        if (room.HasNeon)
        {
            AddNeonEdge(room);
        }
    }

    private void BuildWall(string name, Vector3 pos, Vector3 scale, Material mat)
    {
        var wall = GameObject.CreatePrimitive(PrimitiveType.Cube);
        wall.name = name;
        wall.transform.position = pos;
        wall.transform.localScale = scale;
        wall.GetComponent<Renderer>().sharedMaterial = mat;
        wall.isStatic = true;
        // BoxCollider already present for collision
    }

    private void AddNeonEdge(Room room)
    {
        // Simple neon strips as thin cubes (0.05m height) along the inner perimeter of the room
        float stripHeight = 0.05f;
        float stripThickness = 0.02f;
        Color neonColor = (room.Name == "Neon Corridor") ? new Color(0f, 0.6f, 1f) : new Color(1f, 0f, 0.75f);
        Material neonMat = new Material(Shader.Find("Standard"));
        neonMat.name = $"{room.Name}_Neon";
        neonMat.SetColor("_EmissionColor", neonColor * 4f);
        neonMat.EnableKeyword("_EMISSION");
        neonMat.color = neonColor;

        // Bottom (floor‑level) strips – four sides
        // West side
        CreateNeonStrip($"{room.Name}_Neon_West",
                       new Vector3(room.Position.x + stripThickness / 2f,
                                   stripHeight / 2f,
                                   room.Position.y + room.Size.y / 2f),
                       new Vector3(stripThickness,
                                   stripHeight,
                                   room.Size.y));

        // East side
        CreateNeonStrip($"{room.Name}_Neon_East",
                       new Vector3(room.Position.x + room.Size.x - stripThickness / 2f,
                                   stripHeight / 2f,
                                   room.Position.y + room.Size.y / 2f),
                       new Vector3(stripThickness,
                                   stripHeight,
                                   room.Size.y));

        // North side
        CreateNeonStrip($"{room.Name}_Neon_North",
                       new Vector3(room.Position.x + room.Size.x / 2f,
                                   stripHeight / 2f,
                                   room.Position.y + stripThickness / 2f),
                       new Vector3(room.Size.x,
                                   stripHeight,
                                   stripThickness));

        // South side
        CreateNeonStrip($"{room.Name}_Neon_South",
                       new Vector3(room.Position.x + room.Size.x / 2f,
                                   stripHeight / 2f,
                                   room.Position.y + room.Size.y - stripThickness / 2f),
                       new Vector3(room.Size.x,
                                   stripHeight,
                                   stripThickness));

        void CreateNeonStrip(string objName, Vector3 pos, Vector3 scale)
        {
            var strip = GameObject.CreatePrimitive(PrimitiveType.Cube);
            strip.name = objName;
            strip.transform.position = pos;
            strip.transform.localScale = scale;
            strip.GetComponent<Renderer>().sharedMaterial = neonMat;
            // Make it static – no collider required for visual strip
            strip.isStatic = true;
            DestroyImmediate(strip.GetComponent<Collider>());
        }
    }

    #endregion

    #region Helper – doors

    private void AddDoor(string doorName, Vector2 center, float width, string roomA, string roomB)
    {
        // Door is represented as a thin cubic void (no collider) that can be
        // visualised if desired. For collision we simply *don't* place a wall there.
        // Here we just place a marker object for reference.
        var marker = new GameObject($"{doorName}_Marker");
        marker.transform.position = new Vector3(center.x, 1f, center.y);
        var sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        sphere.transform.parent = marker.transform;
        sphere.transform.localScale = new Vector3(width, 0.1f, 0.1f);
        sphere.GetComponent<Renderer>().sharedMaterial = CreateMaterial(Color.yellow, $"{doorName}_MarkerMat");
        DestroyImmediate(sphere.GetComponent<Collider>());
    }

    #endregion

    #region Lighting

    private void CreateAmbientLight()
    {
        // Soft sky‑like ambient light (mimics museum lighting)
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.25f, 0.25f, 0.28f);
    }

    private void CreateRoomLighting(Room room)
    {
        // Spotlights along the perimeter (4 per room) – 3000 K, high CRI simulated via intensity
        float spotHeight = room.Height - 0.5f;
        float spotRange = Mathf.Max(room.Size.x, room.Size.y) * 1.2f;

        // Create a parent object to keep the hierarchy tidy
        var lightParent = new GameObject($"{room.Name}_Lights");
        lightParent.transform.position = new Vector3(room.Position.x, 0f, room.Position.y);

        // Four corner spots
        CreateSpot($"{room.Name}_Spot_NW",
                    new Vector3(room.Position.x + 0.5f, spotHeight, room.Position.y + 0.5f),
                    lightParent.transform);
        CreateSpot($"{room.Name}_Spot_NE",
                    new Vector3(room.Position.x + room.Size.x - 0.5f, spotHeight, room.Position.y + 0.5f),
                    lightParent.transform);
        CreateSpot($"{room.Name}_Spot_SW",
                    new Vector3(room.Position.x + 0.5f, spotHeight, room.Position.y + room.Size.y - 0.5f),
                    lightParent.transform);
        CreateSpot($"{room.Name}_Spot_SE",
                    new Vector3(room.Position.x + room.Size.x - 0.5f, spotHeight, room.Position.y + room.Size.y - 0.5f),
                    lightParent.transform);

        void CreateSpot(string name, Vector3 position, Transform parent)
        {
            var spot = new GameObject(name);
            spot.transform.parent = parent;
            spot.transform.position = position;
            var light = spot.AddComponent<Light>();
            light.type = LightType.Spot;
            light.range = spotRange;
            light.spotAngle = 45f;
            light.intensity = 4f;
            light.color = new Color(1.0f, 0.95f, 0.9f); // warm museum white
            // Angle down slightly
            spot.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
        }

        // If the room has neon accents, add a subtle directional glow
        if (room.HasNeon)
        {
            var neonLight = new GameObject($"{room.Name}_NeonLight");
            neonLight.transform.parent = lightParent.transform;
            neonLight.transform.position = new Vector3(room.Position.x + room.Size.x / 2f,
                                                      room.Height - 0.2f,
                                                      room.Position.y + room.Size.y / 2f);
            var nd = neonLight.AddComponent<Light>();
            nd.type = LightType.Point;
            nd.range = Mathf.Max(room.Size.x, room.Size.y) * 0.8f;
            nd.intensity = 2f;
            nd.color = (room.Name == "Neon Corridor") ? Color.cyan : new Color(1f, 0f, 0.75f);
        }
    }

    #endregion
}