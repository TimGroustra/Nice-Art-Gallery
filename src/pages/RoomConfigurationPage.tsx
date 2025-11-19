import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import RoomCreator from '@/components/RoomCreator'
import { Link } from 'react-router-dom';

export default function RoomConfigurationPage() {
  const { open } = useWeb3Modal()
  const { isConnected, address } = useAccount()

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4">
      <div className="w-full max-w-4xl mx-auto">
        <header className="flex justify-between items-center py-4 border-b border-gray-700">
          <Link to="/" className="text-2xl font-bold hover:text-blue-400 transition-colors">Nice Art Gallery</Link>
          <Button onClick={() => open()} variant="secondary">
            {isConnected ? `Connected: ${address?.slice(0, 6)}...${address?.slice(-4)}` : 'Connect Wallet'}
          </Button>
        </header>
        <main className="mt-8">
          {isConnected && address ? (
            <RoomCreator userAddress={address} />
          ) : (
            <div className="text-center bg-gray-800 p-8 rounded-lg">
              <h2 className="text-2xl font-semibold">Connect your wallet to begin</h2>
              <p className="text-gray-400 mt-2">You need to connect your wallet to verify NFT ownership and create a room.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}