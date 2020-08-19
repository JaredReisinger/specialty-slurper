import pino from 'pino';

const verbosityLevels = ['info', 'debug', 'trace'];

const prettyOptions = {
  colorize: true,
  ignore: 'pid,hostname',
  translateTime: 'SYS:isoTime',
};

export default function createLogger(verbosity, logFile) {
  const logger = pino(
    {
      level: verbosityLevels[verbosity] || verbosityLevels.slice(-1)[0],
      prettyPrint: !logFile ? prettyOptions : null,
    },
    pino.destination(logFile || 1),
  );
  return logger;
}
