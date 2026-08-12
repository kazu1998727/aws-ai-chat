import { defineBackend } from '@aws-amplify/backend'
import { auth } from './auth/resource'
import { data } from './data/resource'
import { helloWorldFunction } from './function/helloWorld/resource'

export const backend = defineBackend({
  auth,
  data,
  helloWorldFunction,
})
