export class GodotTopicResolver {
  private static readonly INHERITANCE_MAP: Record<string, string> = {
    CharacterBody2D: 'CollisionObject2D',
    CharacterBody3D: 'CollisionObject3D',
    RigidBody2D: 'CollisionObject2D',
    RigidBody3D: 'CollisionObject3D',
    StaticBody2D: 'CollisionObject2D',
    StaticBody3D: 'CollisionObject3D',
    Area2D: 'CollisionObject2D',
    Area3D: 'CollisionObject3D',
    CollisionObject2D: 'Node2D',
    CollisionObject3D: 'Node3D',
    CollisionShape2D: 'Node2D',
    CollisionShape3D: 'Node3D',
    RayCast2D: 'Node2D',
    RayCast3D: 'Node3D',
    Button: 'BaseButton',
    BaseButton: 'Control',
    TextureButton: 'BaseButton',
    CheckButton: 'Button',
    CheckBox: 'Button',
    MenuButton: 'Button',
    OptionButton: 'Button',
    Panel: 'Control',
    PanelContainer: 'Container',
    Container: 'Control',
    BoxContainer: 'Container',
    VBoxContainer: 'BoxContainer',
    HBoxContainer: 'BoxContainer',
    GridContainer: 'Container',
    ScrollContainer: 'Container',
    MarginContainer: 'Container',
    CenterContainer: 'Container',
    Label: 'Control',
    RichTextLabel: 'Control',
    LineEdit: 'Control',
    TextEdit: 'Control',
    TextureRect: 'Control',
    ColorRect: 'Control',
    ProgressBar: 'Range',
    Range: 'Control',
    Control: 'CanvasItem',
    CanvasItem: 'Node',
    Node2D: 'CanvasItem',
    Node3D: 'Node',
    Node: 'Object'
  };

  public static isSubclassOf(className: string, ancestorName: string): boolean {
    let cur: string | undefined = className;
    while (cur) {
      if (cur === ancestorName) return true;
      cur = GodotTopicResolver.INHERITANCE_MAP[cur];
    }
    return false;
  }

  public static extractExtendsClass(code: string): string | null {
    const match = code.match(/^\s*extends\s+([A-Za-z0-9_]+)/m);
    return match ? match[1] : null;
  }

  public static resolveTopic(code: string): 'physics' | 'ui' | 'signals' | 'lifecycle' {
    const extendsClass = GodotTopicResolver.extractExtendsClass(code);

    if (extendsClass) {
      if (
        extendsClass.includes('CharacterBody') ||
        extendsClass.includes('RigidBody') ||
        extendsClass.includes('PhysicsBody') ||
        GodotTopicResolver.isSubclassOf(extendsClass, 'CollisionObject2D') ||
        GodotTopicResolver.isSubclassOf(extendsClass, 'CollisionObject3D')
      ) {
        return 'physics';
      }

      if (
        extendsClass.includes('Container') ||
        extendsClass.includes('Button') ||
        GodotTopicResolver.isSubclassOf(extendsClass, 'Control')
      ) {
        return 'ui';
      }
    }

    if (/(?:^\s*signal\s+\w+|\.connect\s*\()/m.test(code)) {
      return 'signals';
    }

    return 'lifecycle';
  }
}
