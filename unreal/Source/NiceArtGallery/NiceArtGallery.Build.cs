using UnrealBuildTool;

public class NiceArtGallery : ModuleRules
{
	public NiceArtGallery(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(
			new string[]
			{
				"Core",
				"CoreUObject",
				"Engine",
				"InputCore",
				"RenderCore",
				"Slate",
				"SlateCore"
			}
		);
	}
}