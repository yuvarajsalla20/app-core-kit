/** Globals React Native provides at run time. */
declare const __DEV__: boolean;
declare const ErrorUtils: {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};
