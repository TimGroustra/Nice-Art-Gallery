// ... (component code)

// Remove the configuration warning section
return (
  <div className="relative w-screen h-screen overflow-hidden bg-black touch-none">
    <div ref={mountRef} className="w-full h-full touch-none" />
    
    {/* Start Overlay (Mobile) */}
    {isMobile && !isStarted && (
      <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50 cursor-pointer" onClick={handleStart}>
        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl text-center max-w-xs animate-in fade-in zoom-in duration-300">
          <h2 className="text-2xl font-bold text-white mb-4">Nice Art Gallery</h2>
          <p className="text-white/70 mb-6">Drag to look around, tap to interact</p>
          <div className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-bold">Enter Gallery</div>
        </div>
      </div>
    )}

    {/* Instructions Overlay (Desktop) */}
    {!isMobile && instructionsVisible && (
      <div className="absolute top-4 left-4 p-4 bg-black/50 text-white rounded-md cursor-pointer z-10" onClick={handleStart}>
        Click to enter gallery — WASD to move, mouse to look
      </div>
    )}

    {/* Mobile UI Elements */}
    {isMobile && isStarted && (
      <>
        <div className="fixed bottom-4 left-4 right-4 text-white text-center pointer-events-none bg-black/40 p-2 rounded text-xs z-20">
          Drag to look around • Tap panels to interact
        </div>
        <button 
          onClick={() => setIsWalking(!isWalking)} 
          className={`fixed bottom-16 right-6 p-4 rounded-full transition-all z-30 shadow-lg ${isWalking ? 'bg-primary text-primary-foreground scale-110' : 'bg-white/10 text-white backdrop-blur-md border border-white/20'}`}
        >
          <Footprints className={`h-8 w-8 ${isWalking ? 'animate-pulse' : ''}`} />
        </button>
      </>
    )}

    {/* Crosshair (Desktop) */}
    {!isMobile && isStarted && !instructionsVisible && (
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-20">
        <div className="absolute top-1/2 left-0 w-full h-px bg-white/50 -translate-y-1/2"></div>
        <div className="absolute top-0 left-1/2 w-px h-full bg-white/50 -translate-x-1/2"></div>
      </div>
    )}

    {/* Market Browser */}
    {marketBrowserState.open && (
      <MarketBrowserRefined 
        collection={marketBrowserState.collection} 
        tokenId={marketBrowserState.tokenId} 
        open={marketBrowserState.open} 
        onClose={() => setMarketBrowserState({ open: false, collection: '', tokenId: '' })} 
      />
    )}
  </div>
);