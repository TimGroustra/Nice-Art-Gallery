import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CustomRoomData } from '@/config/galleryConfig';

/**
 * Fetches all custom rooms that are currently active (now is between start_time and end_time).
 */
const fetchActiveRooms = async (): Promise<CustomRoomData[]> => {
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('custom_rooms')
    .select('*')
    .lte('start_time', now) // Start time is less than or equal to now
    .gte('end_time', now)   // End time is greater than or equal to now
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching active rooms:", error);
    throw new Error(error.message);
  }

  return data as CustomRoomData[];
};

export function useActiveRooms() {
  return useQuery<CustomRoomData[], Error>({
    queryKey: ['activeRooms'],
    queryFn: fetchActiveRooms,
    // Refetch every 60 seconds to keep the list fresh
    staleTime: 60000, 
  });
}