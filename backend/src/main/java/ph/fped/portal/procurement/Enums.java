package ph.fped.portal.procurement;

/** The fixed choices of the Procurement screens. The words shown to the user are in the React app. */
public final class Enums {

    private Enums() {}

    public enum RecordStatus { ACTIVE, CANCELLED }

    public enum ProposalType { ACTIVITY_PROPOSAL, PROJECT_PROPOSAL, NONE }

    /** HIRING = Hiring of Personnel. */
    public enum ProcType {
        EVENT, EQUIPMENT, REPAIR, HIRING, OTHERS;

        /** Kinds with "item details": what equipment / what is repaired. */
        public boolean hasDetails() { return this == EQUIPMENT || this == REPAIR || this == OTHERS; }

        public boolean detailsRequired() { return this == EQUIPMENT || this == REPAIR; }
    }

    /** For Review FPED, Signed w/o FPED Review, Signed w/ FPED Review. */
    public enum DocStatus { FOR_REVIEW, SIGNED_WITHOUT_REVIEW, SIGNED_WITH_REVIEW }

    public enum Plan { PPMP, SPPMP }

    public enum Facility { GOVERNMENT, NON_GOVERNMENT }

    public enum RouteAction { FORWARDED, REVIEWED, SIGNED, RETURNED, RECEIVED_BACK, OTHER }

    /** DIFFERENT = "not the same, the names only look alike". */
    public enum RepeatType { REPEAT, RESUBMISSION, SAME_ACTIVITY, DIFFERENT }
}
