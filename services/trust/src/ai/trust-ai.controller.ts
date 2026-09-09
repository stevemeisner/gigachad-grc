import {
  Controller,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TrustAiService } from './trust-ai.service';
import { CurrentUser, FirebaseAuthGuard, UserContext } from '@gigachad-grc/shared';

@Controller('trust-ai')
@UseGuards(FirebaseAuthGuard)
export class TrustAiController {
  constructor(private readonly aiService: TrustAiService) {}

  @Post('draft-answer')
  draftAnswer(
    @Query('organizationId') organizationId: string,
    @Body() body: { questionText: string },
    @CurrentUser() user: UserContext,
  ) {
    return this.aiService.generateAnswerDraft(
      organizationId || 'default-org',
      body.questionText,
      user.userId,
    );
  }

  @Post('categorize')
  categorizeQuestion(
    @Query('organizationId') organizationId: string,
    @Body() body: { questionText: string },
    @CurrentUser() user: UserContext,
  ) {
    return this.aiService.categorizeQuestion(
      organizationId || 'default-org',
      body.questionText,
      user.userId,
    );
  }

  @Post('improve-answer')
  improveAnswer(
    @Query('organizationId') organizationId: string,
    @Body() body: { questionText: string; currentAnswer: string },
    @CurrentUser() user: UserContext,
  ) {
    return this.aiService.improveAnswer(
      organizationId || 'default-org',
      body.questionText,
      body.currentAnswer,
      user.userId,
    );
  }
}

