import React from 'react';
import { useWallet } from '@/context/WalletContext';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const WalletGate = () => {
  const { connectWallet, isLoading, error, balance, isConnected } = useWallet();

  return (
    <div className="w-screen h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center p-8 bg-gray-800 rounded-lg shadow-xl max-w-md">
        <h1 className="text-3xl font-bold mb-4">Welcome to the Art Gallery</h1>
        <p className="text-gray-300 mb-6">
          This gallery runs on the Electroneum network.
          <br />
          To enter, you must hold at least 5 ElectroGems NFTs.
        </p>
        
        <Button 
          onClick={connectWallet} 
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Connecting...
            </>
          ) : 'Connect Wallet'}
        </Button>

        {error && (
          <p className="text-red-400 mt-4">{error}</p>
        )}
        {isConnected && !error && (
            <p className="text-green-400 mt-4">
                Wallet connected. Your balance: {balance} ElectroGems.
            </p>
        )}
      </div>
    </div>
  );
};

export default WalletGate;