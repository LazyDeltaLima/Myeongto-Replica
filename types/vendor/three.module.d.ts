// three.js as the page loads it (public/vendor/three.module.js, copied by tools/vendor.mjs): a loose stand-in so the
// browser typecheck does not check the vendored source (types/README.md 「Vendored modules and globals」). Only the
// names public/js uses; a new one goes here (tsc names it). Every class takes any arguments and has any members.

/** A three.js class: any constructor arguments, any member. */
declare class Loose {
  constructor(...args: any[]);
  [key: string]: any;
}

export declare class Vector3 extends Loose {}
export declare class Vector2 extends Loose {}
export declare class Matrix4 extends Loose {}
export declare class Color extends Loose {}
export declare class Vector4 extends Loose {}
export declare class Mesh extends Loose {}
export declare class Float32BufferAttribute extends Loose {}
export declare class ShaderMaterial extends Loose {}
export declare class Group extends Loose {}
export declare class Quaternion extends Loose {}
export declare class PerspectiveCamera extends Loose {}
export declare class InstancedBufferGeometry extends Loose {}
export declare class BufferGeometry extends Loose {}
export declare class BufferAttribute extends Loose {}
export declare class SkinnedMesh extends Loose {}
export declare class Scene extends Loose {}
export declare class MeshStandardMaterial extends Loose {}
export declare class MeshBasicMaterial extends Loose {}
export declare class InterleavedBufferAttribute extends Loose {}
export declare class CanvasTexture extends Loose {}
export declare class ShadowMaterial extends Loose {}
export declare class HemisphereLight extends Loose {}
export declare class DirectionalLight extends Loose {}
export declare class Fog extends Loose {}
export declare class Texture extends Loose {}
export declare class Sphere extends Loose {}
export declare class Skeleton extends Loose {}
export declare class Matrix3 extends Loose {}
export declare class InstancedInterleavedBuffer extends Loose {}
export declare class Euler extends Loose {}
export declare class Box3 extends Loose {}
export declare class WebGLRenderer extends Loose {}
export declare class TextureLoader extends Loose {}
export declare class Raycaster extends Loose {}
export declare class PMREMGenerator extends Loose {}
export declare class Plane extends Loose {}
export declare class Object3D extends Loose {}
export declare class InterleavedBuffer extends Loose {}
export declare class InstancedBufferAttribute extends Loose {}
export declare class Frustum extends Loose {}
export declare class DataTexture extends Loose {}
export declare class Bone extends Loose {}

export declare const DoubleSide: number;
export declare const RepeatWrapping: number;
export declare const SRGBColorSpace: number;
export declare const DynamicDrawUsage: number;
export declare const ZeroFactor: number;
export declare const OneFactor: number;
export declare const NoColorSpace: number;
export declare const FrontSide: number;
export declare const OneMinusSrcAlphaFactor: number;
export declare const LinearMipmapLinearFilter: number;
export declare const LinearFilter: number;
export declare const ClampToEdgeWrapping: number;
export declare const BackSide: number;
export declare const AdditiveBlending: number;
export declare const WebGLCoordinateSystem: number;
export declare const SrcColorFactor: number;
export declare const SrcAlphaSaturateFactor: number;
export declare const SrcAlphaFactor: number;
export declare const OneMinusSrcColorFactor: number;
export declare const OneMinusDstColorFactor: number;
export declare const OneMinusDstAlphaFactor: number;
export declare const NormalBlending: number;
export declare const MirroredRepeatWrapping: number;
export declare const LinearSRGBColorSpace: number;
export declare const IntType: number;
export declare const EquirectangularReflectionMapping: number;
export declare const DstColorFactor: number;
export declare const DstAlphaFactor: number;
export declare const CustomBlending: number;
export declare const AddEquation: number;
export declare const PCFShadowMap: number;
export declare const NoToneMapping: number;
