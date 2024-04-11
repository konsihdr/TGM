import mongoose, { Schema, Document } from 'mongoose';

await mongoose.connect('mongodb+srv://bot:niw0KlOAQnDZhmJF@group-manager0.ncy6wjq.mongodb.net/?retryWrites=true&w=majority&appName=group-manager0' )
interface IGroup extends Document {
    name: string;
    tg_id: string;
    joined: Date;
    active: boolean;
    banned: boolean;
    invite_link: string;
    is_admin: boolean;
}

const groupSchema: Schema = new Schema({
    name: { type: String, required: true },
    tg_id: { type: String, required: true },
    joined: { type: Date, required: true },
    active: { type: Boolean, required: true },
    banned: { type: Boolean, required: true },
    invite_link: { type: String, required: true },
    is_admin: { type: Boolean, required: true },
});

const Group = mongoose.models.Group || mongoose.model<IGroup>('Group', groupSchema);

export default Group;
