import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Rocket, Code, Upload, Wallet, ArrowLeft } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useNftDeployer, DeploymentRecord } from '@/hooks/use-nft-deployer';
import { cn } from '@/lib/utils';
import { formatEther } from 'viem';

// Define form state structure
interface NftFormState extends Omit<DeploymentRecord, 'id' | 'owner_address' | 'contract_address' | 'status' | 'created_at'> {
    // Add fields for file uploads if needed, but for now, focus on contract params
    // We will handle metadata upload separately later.
}

const initialFormState: NftFormState = {
    name: 'My Awesome NFT',
    symbol: 'MAN',
    erc_type: 'ERC721',
    token_count: 1000,
    mint_price: 0.01,
    royalty_fee: 5, // 5%
    custom_code: '// Add custom Solidity code here (e.g., custom functions or modifiers)',
    network: 'testnet',
};

const CreateNft: React.FC = () => {
    const { address: walletAddress, isConnected } = useAccount();
    const { deploy, state, txHash, receipt } = useNftDeployer();
    const [formData, setFormData] = useState<NftFormState>(initialFormState);
    const [step, setStep] = useState<'config' | 'deploy'>('config');

    const isAuthorized = isConnected && walletAddress;
    const isDeploying = state.isLoading || state.isSigning || state.isConfirming;

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? Number(value) : value,
        }));
    };

    const handleSelectChange = (name: keyof NftFormState, value: string) => {
        setFormData(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleDeploy = async (network: 'testnet' | 'mainnet') => {
        if (!isAuthorized || isDeploying) return;
        
        // Update network before deployment
        const deploymentData = { ...formData, network };
        setFormData(deploymentData);
        
        await deploy(deploymentData);
    };
    
    const handleRedeploy = () => {
        // Reset state to allow redeployment
        setStep('config');
        setFormData(initialFormState);
        // Note: The useNftDeployer hook manages its internal state reset upon a new deploy call
    };

    const renderDeploymentStatus = () => {
        if (state.isSuccess) {
            return (
                <Alert className="bg-green-100 border-green-500 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200">
                    <Rocket className="h-4 w-4" />
                    <AlertTitle>Deployment Successful!</AlertTitle>
                    <AlertDescription className="space-y-2">
                        <p>Contract Address: <span className="font-mono break-all">{state.contractAddress}</span></p>
                        <p>Transaction Hash: <span className="font-mono break-all">{txHash}</span></p>
                        <Button onClick={handleRedeploy} className="mt-4">
                            Deploy Another Contract
                        </Button>
                    </AlertDescription>
                </Alert>
            );
        }

        if (state.isError) {
            return (
                <Alert variant="destructive">
                    <Loader2 className="h-4 w-4" />
                    <AlertTitle>Deployment Failed</AlertTitle>
                    <AlertDescription>
                        {state.error || "An unexpected error occurred during deployment."}
                        <Button onClick={() => setStep('config')} variant="outline" className="mt-4 ml-4">
                            Go Back to Configuration
                        </Button>
                    </AlertDescription>
                </Alert>
            );
        }

        if (isDeploying) {
            let message = "Preparing deployment...";
            if (state.status === 'compiling') message = "Compiling contract and preparing transaction...";
            if (state.status === 'signing') message = "Awaiting wallet signature (check your wallet)...";
            if (state.status === 'deploying') message = "Transaction sent. Waiting for confirmation...";

            return (
                <Alert className="bg-blue-100 border-blue-500 text-blue-800 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-200">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertTitle>Deployment in Progress ({state.status})</AlertTitle>
                    <AlertDescription>{message}</AlertDescription>
                </Alert>
            );
        }
        
        return null;
    };

    const renderConfigStep = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Contract Name</Label>
                    <Input id="name" name="name" value={formData.name} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="symbol">Symbol</Label>
                    <Input id="symbol" name="symbol" value={formData.symbol} onChange={handleInputChange} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="erc_type">ERC Standard</Label>
                    <Select value={formData.erc_type} onValueChange={(v) => handleSelectChange('erc_type', v as 'ERC721' | 'ERC1155')}>
                        <SelectTrigger id="erc_type">
                            <SelectValue placeholder="Select ERC Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ERC721">ERC-721 (Single Token)</SelectItem>
                            <SelectItem value="ERC1155">ERC-1155 (Multi Token)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="token_count">Total Tokens</Label>
                    <Input id="token_count" name="token_count" type="number" min={1} value={formData.token_count} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="royalty_fee">Royalty Fee (%)</Label>
                    <Input id="royalty_fee" name="royalty_fee" type="number" min={0} max={100} value={formData.royalty_fee} onChange={handleInputChange} />
                </div>
            </div>
            
            <div className="space-y-2">
                <Label htmlFor="mint_price">Mint Price (ETN)</Label>
                <Input id="mint_price" name="mint_price" type="number" min={0} step={0.001} value={formData.mint_price} onChange={handleInputChange} />
            </div>

            <div className="space-y-2">
                <Label htmlFor="custom_code" className="flex items-center gap-2">
                    <Code className="h-4 w-4" /> Custom Solidity Code (Optional)
                </Label>
                <Textarea 
                    id="custom_code" 
                    name="custom_code" 
                    value={formData.custom_code} 
                    onChange={handleInputChange} 
                    rows={8} 
                    className="font-mono text-sm"
                    placeholder="// Your custom contract logic here..."
                />
            </div>
            
            <Button onClick={() => setStep('deploy')} className="w-full">
                Next: Review & Deploy
            </Button>
        </div>
    );

    const renderDeployStep = () => (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold">Deployment Summary</h3>
            <div className="border rounded-lg p-4 space-y-2 text-sm">
                <p><strong>Contract Name:</strong> {formData.name}</p>
                <p><strong>Symbol:</strong> {formData.symbol}</p>
                <p><strong>ERC Type:</strong> {formData.erc_type}</p>
                <p><strong>Total Tokens:</strong> {formData.token_count}</p>
                <p><strong>Mint Price:</strong> {formData.mint_price} ETN</p>
                <p><strong>Royalty Fee:</strong> {formData.royalty_fee}%</p>
                <p className="text-muted-foreground">Deployment Fee: ~0.001 ETN (Paid via WalletConnect)</p>
            </div>
            
            {renderDeploymentStatus()}

            <div className={cn("space-y-4", { "opacity-50 pointer-events-none": isDeploying })}>
                <h3 className="text-lg font-semibold">Select Network</h3>
                
                {/* 1. Deploy to Testnet */}
                <Button 
                    onClick={() => handleDeploy('testnet')} 
                    className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
                    disabled={isDeploying}
                >
                    <Rocket className="mr-2 h-4 w-4" /> Deploy to Electroneum Testnet
                </Button>
                
                {/* 2. Deploy to Mainnet (Only enabled after successful Testnet deployment) */}
                <Button 
                    onClick={() => handleDeploy('mainnet')} 
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                    disabled={isDeploying || state.status !== 'success' || formData.network === 'mainnet'}
                >
                    <Rocket className="mr-2 h-4 w-4" /> Deploy to Electroneum Mainnet
                </Button>
            </div>
            
            <Button variant="outline" onClick={() => setStep('config')} disabled={isDeploying}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Configuration
            </Button>
        </div>
    );

    if (!isAuthorized) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>Wallet Required</CardTitle>
                        <CardDescription>Please connect your wallet to access the NFT Launcher.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link to="/login">
                            <Button className="w-full">
                                <Wallet className="mr-2 h-4 w-4" /> Connect Wallet
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
            <div className="max-w-3xl mx-auto">
                <Card>
                    <CardHeader>
                        <CardTitle>NFT Contract Launcher</CardTitle>
                        <CardDescription>
                            Design and deploy your custom ERC-721 or ERC-1155 contract on the Electroneum network.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {step === 'config' ? renderConfigStep() : renderDeployStep()}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default CreateNft;