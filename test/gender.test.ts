import { describe, expect, it } from 'vitest'
import { genderOf } from '../src/core/gender.js'
import { NAMES } from '../src/core/names.js'

describe('nombre de mujer o de hombre, para darle un personaje que cuadre', () => {
  it('los de la lista de la app y los comunes', () => {
    expect(['Ana', 'Inés', 'Ximena', 'Zoe', 'Sofi', 'Lupita'].map(genderOf)).toEqual(['f', 'f', 'f', 'f', 'f', 'f'])
    expect(['Beto', 'Saúl', 'Hugo', 'Tavo', 'Jhonny', 'Iván'].map(genderOf)).toEqual(['m', 'm', 'm', 'm', 'm', 'm'])
  })

  it('por la terminación cuando no lo conoce, con sus excepciones', () => {
    expect(genderOf('Fernanda')).toBe('f')
    expect(genderOf('Rigoberto')).toBe('m')
    expect(genderOf('Luca')).toBe('m')
    expect(genderOf('Ana María')).toBe('f')
    expect(genderOf('Ana 2')).toBe('f')
  })

  it('lo que no se sabe queda sin decir', () => {
    expect(genderOf('Dani')).toBeUndefined()
    expect(genderOf('Wen')).toBeUndefined()
    expect(genderOf('')).toBeUndefined()
    expect(genderOf(undefined)).toBeUndefined()
    expect(genderOf('Jefe')).toBeUndefined()
  })

  it('a todos los de la lista de la app, o se les sabe o se les deja libre a propósito', () => {
    const free = NAMES.filter((n) => !genderOf(n))
    expect(free).toEqual(['Dani', 'Gabi', 'Pau', 'Wen'])
  })
})
