import { HttpErrors } from '../errors/http-errors'
import { Request, Response } from 'express'
import { resolve } from 'path'
import { getCustomRepository } from 'typeorm'
import { SurveysRepository } from '../database/repositories/surveys'
import { SurveysUsersRepository } from '../database/repositories/surveys-users'
import { UsersRepository } from '../database/repositories/users'
import mailService from '../services/mail-service'
import * as yup from 'yup'

export class SendMailController {
  async handle(req: Request, res: Response): Promise<Response> {
    const { email, surveyId } = req.body
    const isValidData = await yup
      .object()
      .shape({
        surveyId: yup.string().required(),
        email: yup.string().required().email()
      })
      .isValid(req.body)
    if (!isValidData) throw new HttpErrors('Validation failed', 400)

    const usersRepository = getCustomRepository(UsersRepository)
    const surveysRepository = getCustomRepository(SurveysRepository)
    const surveysUsersRepository = getCustomRepository(SurveysUsersRepository)

    const existentUser = await usersRepository.findOne({ email })
    if (!existentUser) throw new HttpErrors('User not found', 401)

    const existentSurvey = await surveysRepository.findOne({ id: surveyId })
    if (!existentSurvey) throw new HttpErrors('Survey not exists', 400)

    const existentSurveysUsers = await surveysUsersRepository.findOne({
      where: { user_id: existentUser.id, value: null },
      relations: ['users', 'surveys']
    })

    const mailVariables = {
      name: existentUser.name,
      title: existentSurvey.title,
      description: existentSurvey.description,
      link: process.env.MAIL_URL,
      id: ''
    }

    const path = resolve(__dirname, '..', 'views', 'templates', 'nps-mail.hbs')
    if (existentSurveysUsers) {
      mailVariables.id = existentSurveysUsers.id
      mailService.send(email, existentSurvey.title, mailVariables, path)
      return res.json({ existentSurveysUsers })
    }

    const surveysUser = surveysUsersRepository.create({
      user_id: existentUser.id,
      survey_id: surveyId
    })
    await surveysUsersRepository.save(surveysUser)

    mailVariables.id = surveysUser.id
    mailService.send(email, existentSurvey.title, mailVariables, path)
    return res.json({ existentSurveysUsers })
  }
}
