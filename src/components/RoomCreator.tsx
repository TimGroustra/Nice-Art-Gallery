import React from 'react';
import { useReadContract } from 'wagmi';
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { supabase } from '@/integrations/supabase/client';
import { showLoading, showSuccess, showError, dismissToast } from '@/utils/toast';

const TOKEN_CONTRACT = '0xcff0d88Ed5311bAB09178b6ec19A464100880984';
const REQUIRED_BALANCE = 5n;

const erc721Abi = [{ "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }] as const;

const panelSchema = z.object({
  contract: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address."),
  tokenId: z.coerce.number().int().min(1, "Token ID must be positive."),
});

const roomFormSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters."),
  description: z.string().optional(),
  visual_effect: z.enum(['default', 'disco', 'cinematic']),
  audio_file: z.custom<FileList>().optional(),
  start_time: z.date({ required_error: "A start date is required." }),
  duration_days: z.coerce.number().int().min(1, "Duration must be at least 1 day.").max(30, "Duration cannot exceed 30 days."),
  panels: z.array(panelSchema).min(1, "You must configure at least 1 panel.").max(20, "Maximum of 20 panels allowed."),
});

export default function RoomCreator({ userAddress }: { userAddress: `0x${string}` }) {
  const { data: balance, isLoading, isError } = useReadContract({
    address: TOKEN_CONTRACT,
    abi: erc721Abi,
    functionName: 'balanceOf',
    args: [userAddress],
    chainId: 52014, // Electroneum Chain ID
  });

  const form = useForm<z.infer<typeof roomFormSchema>>({
    resolver: zodResolver(roomFormSchema),
    defaultValues: {
      visual_effect: 'default',
      duration_days: 7,
      panels: [{ contract: '', tokenId: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "panels",
  });

  async function onSubmit(values: z.infer<typeof roomFormSchema>) {
    const toastId = showLoading("Creating your room...");
    try {
      let audio_url = null;
      if (values.audio_file && values.audio_file.length > 0) {
        const file = values.audio_file[0];
        // Sanitize filename by replacing spaces with underscores
        const safeFileName = file.name.replace(/\s/g, '_');
        const filePath = `${userAddress}/${Date.now()}-${safeFileName}`;
        
        // NOTE: Assuming 'audio_uploads' bucket exists and is configured for public read
        const { data, error } = await supabase.storage.from('audio_uploads').upload(filePath, file);

        if (error) {
          console.error("Supabase Storage Upload Error:", error);
          throw new Error(`Audio upload failed: ${error.message}. Please check bucket permissions.`);
        }
        
        const { data: { publicUrl } } = supabase.storage.from('audio_uploads').getPublicUrl(data.path);
        audio_url = publicUrl;
      }

      const end_time = new Date(values.start_time);
      end_time.setDate(end_time.getDate() + values.duration_days);

      const roomData = {
        name: values.name,
        description: values.description,
        creator_address: userAddress,
        panels: values.panels.map(p => ({ 
            contract: p.contract, 
            tokenId: p.tokenId 
        })),
        visual_effect: values.visual_effect,
        audio_url,
        start_time: values.start_time.toISOString(),
        end_time: end_time.toISOString(),
      };

      const { error: insertError } = await supabase.from('custom_rooms').insert(roomData);
      if (insertError) throw new Error(`Database error: ${insertError.message}`);

      dismissToast(toastId);
      showSuccess("Room created successfully!");
      form.reset({
        visual_effect: 'default',
        duration_days: 7,
        panels: [{ contract: '', tokenId: 1 }],
      });
    } catch (error) {
      dismissToast(toastId);
      showError(error instanceof Error ? error.message : "An unknown error occurred.");
    }
  }

  if (isLoading) return <div className="text-center p-8">Checking your ElectroGems NFT balance...</div>;
  if (isError) return <div className="text-center bg-red-900/50 p-8 rounded-lg">Error checking your NFT balance. Please try reconnecting your wallet.</div>;

  if (balance === undefined || balance < REQUIRED_BALANCE) {
    return (
      <div className="text-center bg-gray-800 border border-yellow-500 p-8 rounded-lg">
        <h2 className="text-2xl font-semibold text-yellow-400">NFT Ownership Required</h2>
        <p className="text-gray-300 mt-2">You need to hold at least 5 ElectroGems NFTs to create a custom room. You currently hold {balance?.toString() ?? 0}.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 p-8 rounded-lg text-white">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <h2 className="text-3xl font-bold mb-6">Room Details</h2>
          
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Room Name</FormLabel>
              <FormControl><Input placeholder="My Awesome Gallery" {...field} className="bg-gray-700 border-gray-600 text-white" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          
          <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl><Textarea placeholder="A collection of my favorite pieces." {...field} className="bg-gray-700 border-gray-600 text-white" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FormField control={form.control} name="visual_effect" render={({ field }) => (
              <FormItem>
                <FormLabel>Visual Effect</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger className="bg-gray-700 border-gray-600 text-white"><SelectValue placeholder="Select a visual style" /></SelectTrigger></FormControl>
                  <SelectContent className="bg-gray-700 border-gray-600 text-white">
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="disco">Disco</SelectItem>
                    <SelectItem value="cinematic">Cinematic</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="audio_file" render={({ field }) => (
              <FormItem>
                <FormLabel>Background Music (Optional)</FormLabel>
                <FormControl><Input type="file" accept="audio/*" onChange={(e) => field.onChange(e.target.files)} className="bg-gray-700 border-gray-600 text-white file:text-white" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FormField control={form.control} name="start_time" render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal bg-gray-700 border-gray-600 text-white hover:bg-gray-600", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-gray-700 border-gray-600" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="duration_days" render={({ field }) => (
              <FormItem>
                <FormLabel>Duration (days)</FormLabel>
                <FormControl><Input type="number" min="1" max="30" {...field} className="bg-gray-700 border-gray-600 text-white" /></FormControl>
                <FormDescription>Max 30 days.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <h2 className="text-3xl font-bold mb-4 pt-4 border-t border-gray-700">NFT Panels ({fields.length} / 20)</h2>
          
          <div className="space-y-6">
            {fields.map((item, index) => (
              <div key={item.id} className="p-4 border border-gray-700 rounded-lg bg-gray-700/50 relative">
                <h3 className="text-lg font-semibold mb-4 text-blue-300">Panel {index + 1}</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name={`panels.${index}.contract`} render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Contract Address</FormLabel>
                      <FormControl><Input placeholder="0x..." {...field} className="bg-gray-600 border-gray-500 text-white" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  
                  <FormField control={form.control} name={`panels.${index}.tokenId`} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Token ID</FormLabel>
                      <FormControl><Input type="number" placeholder="123" {...field} className="bg-gray-600 border-gray-500 text-white" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                
                {fields.length > 1 && (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    size="icon" 
                    onClick={() => remove(index)}
                    className="absolute top-4 right-4 h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex justify-between items-center pt-4">
            <Button 
              type="button" 
              variant="secondary" 
              onClick={() => append({ contract: '', tokenId: 1 })}
              disabled={fields.length >= 20}
              className="bg-gray-700 hover:bg-gray-600 text-white"
            >
              Add Panel ({fields.length} / 20)
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Create Room</Button>
          </div>
          
          <FormMessage>{form.formState.errors.panels?.message}</FormMessage>
        </form>
      </Form>
    </div>
  );
}