import { supabase } from "@/integrations/supabase/client";

export interface FurnitureItem {
  id: string;
  model_url: string;
  name: string | null;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_y: number;
  scale_multiplier: number;
  target_width: number;
  floor_level: 'ground' | 'first';
  name_filter: string | null;
  scale_y_multiplier: number;
}

/**
 * Fetches all furniture items configured for the gallery.
 */
export async function fetchGalleryFurniture(): Promise<FurnitureItem[]> {
  const { data, error } = await supabase
    .from('gallery_furniture')
    .select('*');

  if (error) {
    console.error("Error fetching gallery furniture:", error);
    return [];
  }

  // Ensure numeric fields are parsed correctly and defaults are applied
  return data.map(item => ({
    ...item,
    position_x: Number(item.position_x || 0),
    position_y: Number(item.position_y || 0),
    position_z: Number(item.position_z || 0),
    rotation_y: Number(item.rotation_y || 0),
    scale_multiplier: Number(item.scale_multiplier || 1.0),
    target_width: Number(item.target_width || 4.5),
    scale_y_multiplier: Number(item.scale_y_multiplier || 1.0),
    floor_level: item.floor_level === 'first' ? 'first' : 'ground',
  })) as FurnitureItem[];
}