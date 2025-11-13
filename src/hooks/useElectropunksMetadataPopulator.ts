import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchTotalSupply, fetchNftMetadata } from '@/utils/nftFetcher';
import { showLoading, dismissToast, showSuccess, showError } from '@/utils/toast';

const ELECTROPUNKS_ADDRESS = "0x0dD500d9eDEF4d0c4B0c50fa0C4faccB711FDA43";
const LOCAL_STORAGE_KEY = 'electropunks_metadata_populated';

export const useElectropunksMetadataPopulator = () => {
  useEffect(() => {
    const runPopulator = async () => {
      // Check if the populator has already been run successfully
      if (localStorage.getItem(LOCAL_STORAGE_KEY)) {
        console.log('ElectroPunks metadata populator has already run.');
        return;
      }

      const toastId = showLoading('Checking for new ElectroPunks NFTs...');
      
      try {
        // 1. Get total supply
        const totalSupply = await fetchTotalSupply(ELECTROPUNKS_ADDRESS);
        console.log(`ElectroPunks total supply: ${totalSupply}`);

        // 2. Get already cached tokens from Supabase
        const { data: existingTokens, error: fetchError } = await supabase
          .from('gallery_nft_metadata')
          .select('token_id')
          .eq('contract_address', ELECTROPUNKS_ADDRESS);

        if (fetchError) {
          throw new Error(`Failed to fetch existing ElectroPunks: ${fetchError.message}`);
        }

        const existingTokenIds = new Set(existingTokens.map(t => t.token_id));
        console.log(`Found ${existingTokenIds.size} existing ElectroPunks in cache.`);

        // 3. Determine which tokens need to be processed
        const tokensToProcess = [];
        for (let i = 1; i <= totalSupply; i++) {
          if (!existingTokenIds.has(i)) {
            tokensToProcess.push(i);
          }
        }

        if (tokensToProcess.length === 0) {
          dismissToast(toastId);
          showSuccess('All ElectroPunks NFTs are up to date.');
          localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
          return;
        }

        dismissToast(toastId);
        const processToastId = showLoading(`Processing ${tokensToProcess.length} new ElectroPunks NFTs. This may take a while...`);

        // 4. Process new tokens in batches
        const batchSize = 10;
        let successfulInserts = 0;
        for (let i = 0; i < tokensToProcess.length; i += batchSize) {
          const batch = tokensToProcess.slice(i, i + batchSize);
          const promises = batch.map(async (tokenId) => {
            try {
              const metadata = await fetchNftMetadata(ELECTROPUNKS_ADDRESS, tokenId);
              // Only insert if metadata includes an image
              if (metadata && metadata.image) {
                return {
                  contract_address: ELECTROPUNKS_ADDRESS,
                  token_id: tokenId,
                  title: metadata.title,
                  description: metadata.description,
                  image: metadata.image,
                  source: metadata.source,
                  attributes: metadata.attributes,
                };
              }
            } catch (error) {
              console.error(`Failed to fetch metadata for ElectroPunk #${tokenId}:`, error);
            }
            return null;
          });

          const results = await Promise.all(promises);
          const validMetadata = results.filter(r => r !== null);

          if (validMetadata.length > 0) {
            const { error: insertError } = await supabase
              .from('gallery_nft_metadata')
              .upsert(validMetadata, { onConflict: 'contract_address, token_id' });

            if (insertError) {
              console.error('Error inserting ElectroPunks batch:', insertError.message);
            } else {
              successfulInserts += validMetadata.length;
              console.log(`Successfully inserted batch of ${validMetadata.length} ElectroPunks.`);
            }
          }
        }

        dismissToast(processToastId);
        if (successfulInserts > 0) {
          showSuccess(`Added ${successfulInserts} new ElectroPunks to the gallery. You may need to refresh to see them.`);
        } else {
          showSuccess('No new valid ElectroPunks found to add.');
        }
        
        // Mark as run even if some failed, to avoid re-running constantly
        localStorage.setItem(LOCAL_STORAGE_KEY, 'true');

      } catch (error) {
        dismissToast(toastId);
        console.error('Error in ElectroPunks populator:', error);
        showError('Failed to update ElectroPunks collection.');
      }
    };

    runPopulator();
  }, []);
};