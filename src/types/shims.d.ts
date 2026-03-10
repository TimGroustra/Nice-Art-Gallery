declare module "react-day-picker" {
  import * as React from "react";
  export interface DayPickerProps extends React.HTMLAttributes<HTMLDivElement> {}
  export const DayPicker: React.FC<DayPickerProps>;
}

declare module "embla-carousel-react" {
  import * as React from "react";

  // The hook used by the original library – we type it loosely as any.
  export type UseEmblaCarouselType = any;

  // Export the hook and related types with permissive any types.
  export const useEmblaCarousel: UseEmblaCarouselType;
  export type EmblaOptionsType = any;
  export type EmblaCarouselType = any;
  export type EmblaEventsType = any;
  export type EmblaPluginsType = any;
}

declare module "recharts" {
  import * as React from "react";

  // Minimal set of component exports used throughout the codebase.
  export const AreaChart: React.FC<any>;
  export const BarChart: React.FC<any>;
  export const LineChart: React.FC<any>;
  export const PieChart: React.FC<any>;
  export const RadarChart: React.FC<any>;
  export const ScatterChart: React.FC<any>;
  export const ComposedChart: React.FC<any>;

  export const XAxis: React.FC<any>;
  export const YAxis: React.FC<any>;
  export const ZAxis: React.FC<any>;
  export const CartesianGrid: React.FC<any>;
  export const Tooltip: React.FC<any>;
  export const Legend: React.FC<any>;
  export const Brush: React.FC<any>;

  export const Line: React.FC<any>;
  export const Bar: React.FC<any>;
  export const Area: React.FC<any>;
  export const Pie: React.FC<any>;
  export const Radar: React.FC<any>;
  export const Scatter: React.FC<any>;
  export const Cell: React.FC<any>;

  export const ResponsiveContainer: React.FC<any>;
  export const Text: React.FC<any>;
  export const Label: React.FC<any>;

  // Anything else can be accessed via index signature.
  const _default: any;
  export default _default;
}

declare module "cmdk" {
  import * as React from "react";

  // Core command components used in the UI.
  export const Command: React.FC<any>;
  export const CommandDialog: React.FC<any>;
  export const CommandInput: React.FC<any>;
  export const CommandList: React.FC<any>;
  export const CommandItem: React.FC<any>;
  export const CommandSeparator: React.FC<any>;
  export const CommandEmpty: React.FC<any>;
  export const CommandGroup: React.FC<any>;
  export const CommandLoading: React.FC<any>;
}

declare module "vaul" {
  import * as React from "react";

  // The drawer component from Vaul – typed loosely.
  export const Drawer: React.FC<any>;
  export const DrawerTrigger: React.FC<any>;
  export const DrawerContent: React.FC<any>;
  export const DrawerOverlay: React.FC<any>;
  export const DrawerHeader: React.FC<any>;
  export const DrawerTitle: React.FC<any>;
  export const DrawerDescription: React.FC<any>;
  export const DrawerClose: React.FC<any>;
}

declare module "input-otp" {
  import * as React from "react";

  // Very permissive stubs for the OTP input library.
  export const OTPInput: React.FC<any>;
  // The context used by the library – we keep it as `any` so callers can access any nested fields.
  export const OTPInputContext: React.Context<any>;
}