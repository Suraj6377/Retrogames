export default {
  isBuffer: () => false,
  from: (data: any) => new Uint8Array(data),
  alloc: (size: number) => new Uint8Array(size)
};
