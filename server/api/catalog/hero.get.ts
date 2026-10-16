import { getLandingHero } from '../../repositories/landing-hero'

export default defineEventHandler((event) => getLandingHero(event))
