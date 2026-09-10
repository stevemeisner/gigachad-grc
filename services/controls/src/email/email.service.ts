import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const emailProvider = this.configService.get<string>('EMAIL_PROVIDER', 'smtp');

    if (emailProvider === 'console') {
      // Console mode for development - just logs emails
      this.logger.log('Email service initialized in CONSOLE mode');
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true,
      });
      return;
    }

    // Every provider below hands the message to somebody who checks the
    // sender. Resend rejects any From address outside a verified domain, so
    // an unset EMAIL_FROM is a broken deployment rather than a detail worth
    // defaulting.
    if (!this.configService.get<string>('EMAIL_FROM')) {
      this.refuseOrFallBackToConsole(
        `EMAIL_PROVIDER=${emailProvider} is set but EMAIL_FROM is not.`,
        'Set EMAIL_FROM to an address your provider is allowed to send from.',
      );
      return;
    }

    if (emailProvider === 'sendgrid') {
      // SendGrid configuration
      const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
      if (!apiKey) {
        this.refuseOrFallBackToConsole(
          'EMAIL_PROVIDER=sendgrid is set but SENDGRID_API_KEY is not.',
          'Set SENDGRID_API_KEY, or choose another EMAIL_PROVIDER.',
        );
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: apiKey,
        },
      });
      this.logger.log('Email service initialized with SendGrid');
    } else if (emailProvider === 'ses') {
      // AWS SES configuration
      const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
      const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
      const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

      if (!accessKeyId || !secretAccessKey) {
        this.refuseOrFallBackToConsole(
          'EMAIL_PROVIDER=ses is set but AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not both present.',
          'Set both SES SMTP credentials, or choose another EMAIL_PROVIDER.',
        );
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: `email-smtp.${region}.amazonaws.com`,
        port: 587,
        secure: false,
        auth: {
          user: accessKeyId,
          pass: secretAccessKey,
        },
      });
      this.logger.log('Email service initialized with AWS SES');
    } else if (emailProvider === 'resend') {
      // Resend configuration. Resend speaks plain SMTP, so it needs no SDK.
      // The username is the literal string 'resend' for every account - it is
      // not an email address - and the password is the API key including its
      // re_ prefix. Port 465 with implicit TLS is Resend's own recommendation;
      // 587 would mean STARTTLS, one more thing to get wrong.
      const apiKey = this.configService.get<string>('RESEND_API_KEY');
      if (!apiKey) {
        this.refuseOrFallBackToConsole(
          'EMAIL_PROVIDER=resend is set but RESEND_API_KEY is not.',
          'Set RESEND_API_KEY to a key from the Resend dashboard, or choose another EMAIL_PROVIDER.',
        );
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: {
          user: 'resend',
          pass: apiKey,
        },
      });
      this.logger.log('Email service initialized with Resend');
    } else if (emailProvider === 'smtp') {
      // Generic SMTP configuration
      const host = this.configService.get<string>('SMTP_HOST');
      const port = this.configService.get<number>('SMTP_PORT', 587);
      const secure = this.configService.get<boolean>('SMTP_SECURE', false);
      const user = this.configService.get<string>('SMTP_USER');
      const pass = this.configService.get<string>('SMTP_PASS');

      if (!host || !user || !pass) {
        this.refuseOrFallBackToConsole(
          'EMAIL_PROVIDER=smtp is set but SMTP_HOST, SMTP_USER and SMTP_PASS are not all present.',
          'Set all three, or choose another EMAIL_PROVIDER.',
        );
        return;
      }

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });
      this.logger.log('Email service initialized with SMTP');
    } else {
      // An unrecognised value used to fall through to the SMTP branch, so a
      // typo was indistinguishable from a deliberate choice.
      this.refuseOrFallBackToConsole(
        `EMAIL_PROVIDER='${emailProvider}' is not a provider this service knows.`,
        'Use console, smtp, sendgrid, ses or resend.',
      );
    }
  }

  /**
   * Incomplete configuration used to mean a logger.warn and a silent switch to
   * console mode. In production that is how notification emails disappear into
   * the container log for weeks while every send reports success. Refuse to
   * start instead. Outside production the old fallback is still what you want.
   */
  private refuseOrFallBackToConsole(problem: string, action: string): void {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (nodeEnv === 'production') {
      throw new Error(
        `EMAIL CONFIGURATION ERROR: ${problem} ` +
          'Under NODE_ENV=production this service will not fall back to writing ' +
          `messages to the log instead of sending them. ${action}`,
      );
    }

    this.logger.warn(
      `${problem} Falling back to console mode: emails are logged, not sent.`,
    );
    this.initializeConsoleMode();
  }

  private initializeConsoleMode(): void {
    this.transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });
    this.logger.log('Email service initialized in CONSOLE mode (fallback)');
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      // No real-domain default: a From address the operator never configured
      // is rejected by Resend and silently dropped by others. Anything but
      // console mode has already required EMAIL_FROM in initializeTransporter,
      // so this fallback is only ever reachable when nothing is being sent.
      const from = this.configService.get<string>('EMAIL_FROM', 'noreply@localhost');
      const fromName = this.configService.get<string>('EMAIL_FROM_NAME', 'GigaChad GRC');

      const mailOptions = {
        from: `"${fromName}" <${from}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html),
      };

      const info = await this.transporter.sendMail(mailOptions);

      // In console mode, log the email content
      if (this.configService.get<string>('EMAIL_PROVIDER', 'smtp') === 'console') {
        this.logger.log(`[CONSOLE MODE] Email would be sent:
  From: ${mailOptions.from}
  To: ${options.to}
  Subject: ${options.subject}
  Message ID: ${info.messageId}

  Body Preview:
  ${options.text ? options.text.substring(0, 200) : this.stripHtml(options.html).substring(0, 200)}...
        `);
      } else {
        this.logger.log(`Email sent successfully to ${options.to} (Message ID: ${info.messageId})`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error.message);
      return false;
    }
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logger.log('Email service connection verified');
      return true;
    } catch (error) {
      this.logger.error('Email service connection failed:', error.message);
      return false;
    }
  }
}
