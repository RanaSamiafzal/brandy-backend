import { supportService } from "./support.service.js";
import { supportRepository } from "./support.repository.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { sendEmail } from "../../utils/email.js";

const createTicket = AsyncHandler(async (req, res) => {
    const ticket = await supportService.createTicket(req.user._id, req.body);
    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, ticket, "Support ticket created successfully")
    );
});

const getMyTickets = AsyncHandler(async (req, res) => {
    const { status } = req.query;
    const tickets = await supportRepository.findByUserId(req.user._id, status);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, tickets, "My tickets fetched")
    );
});

const getTicketDetails = AsyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const ticket = await supportRepository.findById(ticketId);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, ticket, "Ticket details fetched")
    );
});

const getAllTickets = AsyncHandler(async (req, res) => {
    // Admin only access via routes config
    const { status, type } = req.query;
    const filters = {};
    if (status) filters.status = status;
    if (type) filters.type = type;
    
    const tickets = await supportRepository.getAllTickets(filters);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, tickets, "All tickets fetched for admin")
    );
});

const contactUs = AsyncHandler(async (req, res) => {
    const { firstName, lastName, email, subject, message } = req.body;
    
    if (!firstName || !lastName || !email || !message) {
        throw new ApiError(validationStatus.badRequest, "Missing required fields");
    }

    const html = `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${firstName} ${lastName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
    `;

    // Assuming we send it to an admin email or the support email
    await sendEmail({
        to: process.env.EMAIL_USER, // sending to ourselves
        subject: `Contact Form: ${subject}`,
        html
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, null, "Message sent successfully")
    );
});

export const supportController = {
    createTicket,
    getMyTickets,
    getTicketDetails,
    getAllTickets,
    contactUs
};
