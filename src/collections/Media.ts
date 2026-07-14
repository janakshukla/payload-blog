import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      name: 'tags',
      type: 'text',
    },
    {
      name: 'capturedAt',
      type: 'date',
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
    },
  ],
  upload: true,
}
