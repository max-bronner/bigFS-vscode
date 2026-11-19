export interface ToolBox {
  use<Input, Output>(tool: Tool<Input, Output>): (input: Input) => Promise<Output>;
}

export interface Tool<Input, Output> {
  readonly id: string;
  run(input: Input, tools: ToolBox): Promise<Output> | Output;
}

export interface ToolRegistry extends ToolBox {
  register(...tools: Tool<never, unknown>[]): void;
  get(id: string): Tool<never, unknown> | undefined;
  all(): readonly Tool<never, unknown>[];
}

export const createToolRegistry = (): ToolRegistry => {
  const tools = new Map<string, Tool<never, unknown>>();

  const registry: ToolRegistry = {
    register(...added) {
      for (const tool of added) {
        if (tools.has(tool.id)) {
          throw new Error(`A tool is already registered as '${tool.id}'`);
        }

        tools.set(tool.id, tool);
      }
    },

    get: (id) => tools.get(id),

    all: () => Array.from(tools.values()),

    use<Input, Output>(tool: Tool<Input, Output>) {
      return async (input: Input) => {
        const registered = tools.get(tool.id) as Tool<Input, Output> | undefined;

        return (registered ?? tool).run(input, registry);
      };
    },
  };

  return registry;
};
