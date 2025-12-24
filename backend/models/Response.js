import mongoose from 'mongoose';

const AnswerSchema = new mongoose.Schema({
    questionId: { type: String, required: true },
    type: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true } // texte, objet ou tableau
});

const ResponseSchema = new mongoose.Schema({
    surveyId: { type: String, required: true },
    userId: { type: String },
    answers: [AnswerSchema],
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Response', ResponseSchema);
