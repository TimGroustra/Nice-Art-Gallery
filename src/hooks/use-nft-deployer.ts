import { useState, useCallback } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { toast } from 'sonner';
import { showError } from '@/utils/toast';

// Define the structure for the deployment record
export interface DeploymentRecord {
    id: string;
    owner_address: string;
    name: string;
    symbol: string;
    erc_type: 'ERC721' | 'ERC1155';
    token_count: number;
    mint_price: number;
    royalty_fee: number;
    custom_code: string;
    contract_address: string | null;
    network: 'testnet' | 'mainnet';
    status: 'pending' | 'compiling' | 'signing' | 'deploying' | 'success' | 'failed';
}

// Define the structure for the transaction data returned by the Edge Function
interface DeploymentTxData {
    abi: any[];
    bytecode: `0x${string}`;
    constructorArgs: any[];
    deploymentId: string;
    network: 'testnet' | 'mainnet';
    value: string; // Deployment fee in Wei (string)
}

interface DeployerState {
    status: DeploymentRecord['status'];
    error: string | null;
    deploymentId: string | null;
    contractAddress: string | null;
    txHash: `0x${string}` | null;
}

/**
 * Custom hook to handle the full NFT contract deployment lifecycle.
 */
export function useNftDeployer() {
    const { address: walletAddress } = useAccount();
    const [state, setState] = useState<DeployerState>({
        status: 'pending',
        error: null,
        deploymentId: null,
        contractAddress: null,
        txHash: null,
    });

    // Wagmi hook for contract deployment
    const { data: hash, writeContract, isPending: isSigning } = useWriteContract();

    // Wagmi hook for waiting for transaction confirmation
    const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({
        hash,
    });

    // 1. Update Supabase record status
    const updateStatus = useCallback(async (id: string, newStatus: DeployerState['status'], contractAddress?: string, txHash?: `0x${string}`, error?: string) => {
        setState(prev => ({ 
            ...prev, 
            status: newStatus, 
            error: error || null, 
            contractAddress: contractAddress || prev.contractAddress,
            txHash: txHash || prev.txHash,
        }));
        
        const updateData: Partial<DeploymentRecord> = { status: newStatus };
        if (contractAddress) updateData.contract_address = contractAddress;
        if (error) updateData.custom_code = error; // Use custom_code field to store error details temporarily
        
        const { error: dbError } = await supabase
            .from('deployed_contracts')
            .update(updateData)
            .eq('id', id);

        if (dbError) {
            console.error("Failed to update DB status:", dbError);
            showError("Failed to update deployment status in database.");
        }
    }, []);

    // 2. Handle transaction confirmation
    // This effect runs when the transaction hash is confirmed on the blockchain
    const handleConfirmation = useCallback(async () => {
        if (!isConfirmed || !receipt || !state.deploymentId) return;

        const newContractAddress = receipt.contractAddress;
        
        if (newContractAddress) {
            toast.success(`Contract deployed successfully at: ${newContractAddress}`);
            await updateStatus(state.deploymentId, 'success', newContractAddress, receipt.transactionHash);
        } else {
            // Should not happen for contract deployment, but handle failure case
            toast.error("Deployment failed: No contract address found in receipt.");
            await updateStatus(state.deploymentId, 'failed', undefined, receipt.transactionHash, "No contract address in receipt.");
        }
        
        // Reset state after completion
        setState(prev => ({ ...prev, status: 'success', txHash: receipt.transactionHash, contractAddress: newContractAddress || null }));

    }, [isConfirmed, receipt, state.deploymentId, updateStatus]);

    useEffect(() => {
        if (isConfirmed) {
            handleConfirmation();
        }
    }, [isConfirmed, handleConfirmation]);

    // 3. Main deployment function
    const deploy = useCallback(async (formData: Omit<DeploymentRecord, 'id' | 'owner_address' | 'contract_address' | 'status' | 'created_at'>) => {
        if (!walletAddress) {
            showError("Wallet not connected.");
            return;
        }
        
        setState({ status: 'pending', error: null, deploymentId: null, contractAddress: null, txHash: null });

        try {
            // A. Create initial record in Supabase
            const { data: insertData, error: insertError } = await supabase
                .from('deployed_contracts')
                .insert({
                    ...formData,
                    owner_address: walletAddress,
                    status: 'compiling',
                })
                .select('id')
                .single();

            if (insertError || !insertData) {
                throw new Error(`Failed to create deployment record: ${insertError?.message || 'Unknown error'}`);
            }
            const deploymentId = insertData.id;
            setState(prev => ({ ...prev, deploymentId, status: 'compiling' }));
            toast.loading("1/3: Compiling contract and preparing transaction...", { id: deploymentId });

            // B. Call Edge Function to get transaction data
            const { data: txData, error: invokeError } = await supabase.functions.invoke('deploy-nft-contract', {
                method: 'POST',
                body: { ...formData, deploymentId },
            });

            if (invokeError) {
                throw new Error(`Edge Function failed: ${invokeError.message}`);
            }
            
            const deploymentTxData = txData as DeploymentTxData;
            
            if (!deploymentTxData.bytecode || !deploymentTxData.abi) {
                throw new Error("Compilation failed: Missing bytecode or ABI from server.");
            }

            // C. Request wallet signature for deployment
            setState(prev => ({ ...prev, status: 'signing' }));
            toast.loading("2/3: Awaiting wallet signature...", { id: deploymentId });
            
            // Use wagmi's writeContract for deployment (since we have ABI and bytecode)
            writeContract({
                abi: deploymentTxData.abi,
                bytecode: deploymentTxData.bytecode,
                args: deploymentTxData.constructorArgs,
                value: parseEther(String(Number(deploymentTxData.value) / 1e18)), // Convert Wei string back to BigInt/Number for Viem/Wagmi
            });
            
            // The rest of the flow (waiting for hash, confirmation) is handled by the effects above.

        } catch (e: any) {
            const errorMessage = e.message || "An unknown deployment error occurred.";
            console.error("Deployment failed:", e);
            showError(errorMessage);
            
            if (state.deploymentId) {
                await updateStatus(state.deploymentId, 'failed', undefined, undefined, errorMessage);
            }
            setState(prev => ({ ...prev, status: 'failed', error: errorMessage }));
            toast.error("Deployment failed.", { id: state.deploymentId || undefined });
        }
    }, [walletAddress, writeContract, updateStatus, state.deploymentId]);
    
    // Update status when signing starts/ends
    useEffect(() => {
        if (isSigning) {
            setState(prev => ({ ...prev, status: 'signing' }));
        } else if (hash && state.deploymentId) {
            // Signing successful, transaction sent
            setState(prev => ({ ...prev, status: 'deploying', txHash: hash }));
            toast.loading("3/3: Transaction sent. Waiting for confirmation...", { id: state.deploymentId });
        } else if (!isSigning && !hash && state.status === 'signing') {
            // Signing failed (user rejected or error before sending)
            setState(prev => ({ ...prev, status: 'failed', error: "Wallet signature rejected or failed." }));
            toast.error("Wallet signature rejected or failed.", { id: state.deploymentId || undefined });
        }
    }, [isSigning, hash, state.deploymentId, state.status]);


    return {
        deploy,
        state: {
            ...state,
            isSigning,
            isConfirming,
            isSuccess: state.status === 'success',
            isError: state.status === 'failed',
            isLoading: state.status === 'compiling' || state.status === 'signing' || state.status === 'deploying',
        },
        txHash: hash,
        receipt,
    };
}