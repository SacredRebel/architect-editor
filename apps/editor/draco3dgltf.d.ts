declare module 'draco3dgltf' {
  const draco3dgltf: {
    createDecoderModule: () => Promise<unknown>
    createEncoderModule: () => Promise<unknown>
  }
  export default draco3dgltf
}
