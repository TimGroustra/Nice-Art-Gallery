import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveRooms } from '@/hooks/useActiveRooms';
import { Loader2, GalleryHorizontal, Home } from 'lucide-react';
import { format } from 'date-fns';

const RoomPage = () => {
  const { data: rooms, isLoading, isError, error } = useActiveRooms();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        <p className="mt-4 text-lg">Loading active galleries...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <div className="text-center bg-red-900/50 p-8 rounded-lg">
          <h1 className="text-3xl font-bold mb-4 text-red-400">Error Loading Rooms</h1>
          <p className="text-red-200">Could not fetch active rooms: {error?.message || 'Unknown error'}</p>
        </div>
        <div className="mt-12">
          <Button variant="outline" asChild>
            <Link to="/">
              <Home className="mr-2 h-4 w-4" /> Back to Main Gallery
            </Link>
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4">
      <div className="text-center mb-12 mt-12">
        <h1 className="text-5xl font-bold mb-4">Custom Gallery Rooms</h1>
        <p className="text-xl text-gray-400">Explore currently active user-created exhibitions.</p>
      </div>
      
      <div className="flex justify-center w-full mb-8">
        <Button variant="outline" asChild>
          <Link to="/room-configuration">
            <GalleryHorizontal className="mr-2 h-4 w-4" /> Create Your Own Room
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl w-full">
        
        {rooms.length === 0 ? (
            <div className="col-span-full text-center p-12 bg-gray-800 rounded-lg">
                <p className="text-lg text-gray-400">No custom rooms are currently active.</p>
                <p className="text-sm text-gray-500 mt-2">Be the first to create one!</p>
            </div>
        ) : (
            rooms.map((room) => (
              <Card key={room.id} className="bg-gray-800 border-gray-700 transition-colors">
                <CardHeader>
                  <CardTitle className="text-blue-300">{room.name}</CardTitle>
                  <CardDescription className="text-gray-400">
                    {room.description || `Featuring collection: ${room.collection_address.slice(0, 6)}...`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-gray-500">
                    Active until: {format(new Date(room.end_time), 'PPP')}
                  </p>
                  <Button asChild className="w-full bg-blue-600 text-white">
                    <Link to={`/gallery/${room.id}`}>Enter Custom Gallery</Link>
                  </Button>
                </CardContent>
              </Card>
            ))
        )}
      </div>
       <div className="mt-12">
          <Button variant="outline" asChild>
            <Link to="/">
              <Home className="mr-2 h-4 w-4" /> Back to Main Gallery
            </Link>
          </Button>
        </div>
    </div>
  );
};

export default RoomPage;