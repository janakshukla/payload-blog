import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { azureStorage } from '@payloadcms/storage-azure'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Categories } from './collections/Categories'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Categories],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins:
    process.env.DISABLE_EXTERNAL_STORAGE === 'true'
      ? []
      : [
          azureStorage({
            collections: {
              media: true,
            },
            allowContainerCreate:
              process.env.AZURE_STORAGE_ALLOW_CONTAINER_CREATE === 'true',
            baseURL: process.env.AZURE_STORAGE_ACCOUNT_BASEURL!,
            connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING!,
            containerName: process.env.AZURE_STORAGE_CONTAINER_NAME!,
          }),
        ],
})
