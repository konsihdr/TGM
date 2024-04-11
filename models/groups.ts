import mongoose, { Schema, Document } from 'mongoose';

await mongoose.connect(Deno.env.get("MONGO_URI")!)
interface IGroup extends Document {
    name: string;
    tg_id: string;
    joined: Date;
    active: boolean;
    banned: boolean;
    invite_link: string;
    is_admin: boolean;
    date_modified: Date;
}

const groupSchema: Schema = new Schema({
    name: { type: String, required: true },
    tg_id: { type: String, required: true },
    joined: { type: Date, required: true },
    active: { type: Boolean, required: false },
    banned: { type: Boolean, required: false },
    invite_link: { type: String, required: false },
    is_admin: { type: Boolean, required: true },
    date_modified: { type: Date, required: false },
});

const Group = mongoose.models.Group || mongoose.model<IGroup>('Group', groupSchema);

export default Group;
