import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const RoomPage = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4">Custom Galleries</h1>
        <p className="text-xl text-gray-400">Select a gallery room to explore.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl w-full">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle>Gallery One</CardTitle>
            <CardDescription>A vibrant and eclectic mix of digital art.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/gallery/1">Enter Gallery</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle>Gallery Two</CardTitle>
            <CardDescription>Featuring modern classics and legendary collections.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/gallery/2">Enter Gallery</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle>Gallery Three</CardTitle>
            <CardDescription>An exhibition of animated and video-based NFTs.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/gallery/3">Enter Gallery</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
       <div className="mt-12">
          <Button variant="outline" asChild>
            <Link to="/">Back to Main Gallery</Link>
          </Button>
        </div>
    </div>
  );
};

export default RoomPage;