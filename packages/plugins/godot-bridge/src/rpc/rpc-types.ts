export interface GodotRpcRequest {
  id: string;
  action: 'ping' | 'get_ui_tree' | 'screenshot' | 'simulate_input' | 'eval';
  payload?: Record<string, unknown>;
}

export interface GodotRpcResponse<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
}

export interface GodotUiNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  text?: string;
  disabled?: boolean;
  children?: GodotUiNode[];
}

export interface GodotUiTreePayload {
  viewport: {
    width: number;
    height: number;
    aspectRatio: string;
  };
  nodes: GodotUiNode[];
}
