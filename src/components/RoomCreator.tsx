import React from 'react';
import { useReadContract } from 'wagmi';
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { supabase } from '@/integrations/supabase/client';
import { showLoading, showSuccess, showError, dismissToast } from '@/utils/toast';

const TOKEN_CONTRACT = '0xcff0d88Ed5311bAB09178b6ec19A464100880984';
const REQUIRED_BALANCE = 5n;

const erc721Abi = [{ "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }] as const;

const roomFormSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters."),
  description: z.string().optional(),
  collection_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Please enter a valid Ethereum address."),
  visual_effect: z.enum(['default', 'disco', 'cinematic']),
  audio_file: z.custom<FileList>().optional(),
  start_time: z.date({ required_error: "A start date is required." }),
  duration_days: z.coerce.number().int().min(1, "Duration must be at least 1 day.").max(30, "Duration cannot exceed 30 days."),
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
    },
  });

  async function onSubmit(values: z.infer<typeof roomFormSchema>) {
    const toastId = showLoading("Creating your room...");
    try {
      let audio_url = null;
      if (values.audio_file && values.audio_file.length > 0) {
        const file = values.audio_file[0];
        const filePath = `${userAddress}/${Date.now()}-${file.name}`;
        const { data, error } = await supabase.storage.from('audio_uploads').upload(filePath, file);

        if (error) throw new Error(`Audio upload failed: ${error.message}`);
        
        const { data: { publicUrl } } = supabase.storage.from('audio_uploads').getPublicUrl(data.path);
        audio_url = publicUrl;
      }

      const end_time = new Date(values.start_time);
      end_time.setDate(end_time.getDate() + values.duration_days);

      const roomData = {
        name: values.name,
        description: values.description,
        creator_address: userAddress,
        collection_address: values.collection_address,
        visual_effect: values.visual_effect,
        audio_url,
        start_time: values.start_time.toISOString(),
        end_time: end_time.toISOString(),
      };

      const { error: insertError } = await supabase.from('custom_rooms').insert(roomData);
      if (insertError) throw new Error(`Database error: ${insertError.message}`);

      dismissToast(toastId);
      showSuccess("Room created successfully!");
      form.reset();
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
    <div className="bg-gray-800 p-8 rounded-lg">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Room Name</FormLabel>
              <FormControl><Input placeholder="My Awesome Gallery" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl><Textarea placeholder="A collection of my favorite pieces." {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="collection_address" render={({ field }) => (
            <FormItem>
              <FormLabel>Collection Contract Address</FormLabel>
              <FormControl><Input placeholder="0x..." {...field} /></FormControl>
              <FormDescription>The NFT collection to display in this room.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FormField control={form.control} name="visual_effect" render={({ field }) => (
              <FormItem>
                <FormLabel>Visual Effect</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select a visual style" /></SelectTrigger></FormControl>
                  <SelectContent>
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
                <FormControl><Input type="file" accept="audio/*" onChange={(e) => field.onChange(e.target.files)} /></FormControl>
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
                      <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="duration_days" render={({ field }) => (
              <FormItem>
                <FormLabel>Duration (days)</FormLabel>
                <FormControl><Input type="number" min="1" max="30" {...field} /></FormControl>
                <FormDescription>Max 30 days.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <Button type="submit">Create Room</Button>
        </form>
      </Form>
    </div>
  );
}