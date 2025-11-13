import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchTotalSupply, fetchNftMetadata } from '@/utils/nftFetcher';
import { showError, showSuccess } from '@/utils/toast';

const ELECTROPUNKS_ADDRESS = "0x0dD500d9eDEF4d0c4B0c50fa0C4faccB711FDA43";
const CHECK_INTERVAL = 60 * 1000 * 5; // 5 minutes

export function useElectropunksMetadataPopulator() {
  const [isPopulating, setIsPopulating] = useState(false);
  const isPopulatingRef = useRef(false);

  useEffect(() => {
    const populate = async () => {
      if (isPopulatingRef.current) {
        console.log("ElectroPunks populator: Already running.");
        return;
      }
      
      isPopulatingRef.current = true;
      setIsPopulating(true);
      console.log("ElectroPunks populator: Starting check...");

      try {
        const totalSupply = await fetchTotalSupply(ELECTROPUNKS_ADDRESS);
        
        const { data: existingNfts, error: fetchError } = await supabase
          .from('gallery_nft_metadata')
          .select('token_id')
          .eq('contract_address', ELECTROPUNKS_ADDRESS);

        if (fetchError) {
          throw new Error(`Failed to fetch existing ElectroPunks: ${fetchError.message}`);
        }

        const existingTokenIds = new Set(existingNfts.map(nft => Number(nft.token_id)));
        
        const allTokenIds = Array.from({ length: totalSupply }, (_, i) => i + 1);
        const missingTokenIds = allTokenIds.filter(id => !existingTokenIds.has(id));

        if (missingTokenIds.length === 0) {
          console.log("ElectroPunks populator: All metadata is up to date.");
          return;
        }

        console.log(`ElectroPunks populator: Found ${missingTokenIds.length} missing NFTs. Fetching...`);
        showSuccess(`Found ${missingTokenIds.length} missing ElectroPunks. Starting background sync.`);

        for (const tokenId of missingTokenIds) {
          try {
            const metadata = await fetchNftMetadata(ELECTROPUNKS_ADDRESS, tokenId);
            
            const { error: insertError } = await supabase
              .from('gallery_nft_metadata')
              .insert({
                contract_address: ELECTROPUNKS_ADDRESS,
                token_id: tokenId,
                title: metadata.title,
                description: metadata.description,
                image: metadata.image,
                source: metadata.source,
                attributes: metadata.attributes,
              });

            if (insertError) {
              console.error(`ElectroPunks populator: Failed to insert token ${tokenId}:`, insertError.message);
            } else {
              console.log(`ElectroPunks populator: Successfully inserted token ${tokenId}: ${metadata.title}`);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (fetchMetaError) {
            console.error(`ElectroPunks populator: Failed to fetch metadata for token ${tokenId}:`, fetchMetaError);
          }
        }
        console.log("ElectroPunks populator: Finished fetching batch.");
        showSuccess(`Finished syncing ${missingTokenIds.length} ElectroPunks.`);

      } catch (error) {
        console.error("ElectroPunks populator: An error occurred during population check:", error);
        if (error instanceof Error) {
            showError(`ElectroPunks sync error: ${error.message}`);
        }
      } finally {
        isPopulatingRef.current = false;
        setIsPopulating(false);
        console.log("ElectroPunks populator: Check finished.");
      }
    };

    const timeoutId = setTimeout(populate, 5000); // Initial delay of 5 seconds
    const intervalId = setInterval(populate, CHECK_INTERVAL);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, []);

  return { isPopulating };
}