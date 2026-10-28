// mapshaper ships no types. Only the API used by the import jobs is declared.
declare module 'mapshaper' {
  const mapshaper: {
    applyCommands(commands: string, input?: Record<string, unknown>): Promise<Record<string, Buffer | string>>;
  };
  export default mapshaper;
}
